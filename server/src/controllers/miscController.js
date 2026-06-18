const { User, ServiceRequest, Payment, AuditLog, Notification, CallLog } = require("../models");
const { asyncHandler, ApiError } = require("../utils/apiError");
const { serializeNotification, serializeAudit } = require("../utils/serializers");
const { audit, notify, notifyAdmins } = require("../utils/helpers");

const PENDING = ["submitted", "documents_required", "in_review", "in_progress", "waiting_otp", "waiting_payment"];
const DONE = ["completed", "delivered"];
const DELAY_DAYS = 4;

// GET /api/stats/admin
exports.adminStats = asyncHandler(async (_req, res) => {
  const [totalRequests, completedRequests, waitingPayment, totalCustomers, totalAgents, activeAgents, paymentsReceived] =
    await Promise.all([
      ServiceRequest.countDocuments(),
      ServiceRequest.countDocuments({ status: { $in: DONE } }),
      ServiceRequest.countDocuments({ status: "waiting_payment" }),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "agent", isActive: true }),
      Payment.countDocuments({ status: "received" }),
    ]);
  const pendingRequests = await ServiceRequest.countDocuments({ status: { $in: PENDING } });
  res.json({
    success: true,
    stats: { totalRequests, pendingRequests, completedRequests, waitingPayment, paymentsReceived, totalCustomers, totalAgents, activeAgents },
  });
});

// GET /api/stats/agents  (admin) — performance per agent
exports.agentPerformance = asyncHandler(async (_req, res) => {
  const agents = await User.find({ role: "agent" });
  const cutoff = Date.now() - DELAY_DAYS * 86400000;
  const performance = await Promise.all(
    agents.map(async (a) => {
      const mine = await ServiceRequest.find({ assignedAgent: a._id }).select("status createdAt");
      const pending = mine.filter((r) => PENDING.includes(r.status));
      return {
        agentId: String(a._id),
        agentName: a.name,
        totalAssigned: mine.length,
        completed: mine.filter((r) => DONE.includes(r.status)).length,
        pending: pending.length,
        delayed: pending.filter((r) => new Date(r.createdAt).getTime() < cutoff).length,
      };
    })
  );
  res.json({ success: true, performance });
});

// ── Notifications (own) ───────────────────────────────────────────
exports.listNotifications = asyncHandler(async (req, res) => {
  const list = await Notification.find({ user: req.user.id }).sort({ at: -1 }).limit(50);
  res.json({ success: true, notifications: list.map(serializeNotification), unread: list.filter((n) => !n.read).length });
});
exports.markNotificationRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { read: true });
  res.json({ success: true });
});
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user.id }, { read: true });
  res.json({ success: true });
});

// GET /api/audit  (admin)
exports.listAudit = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.action) q.action = req.query.action;
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
  const list = await AuditLog.find(q).populate("actor", "name").sort({ at: -1 }).limit(limit);
  res.json({ success: true, logs: list.map(serializeAudit) });
});

// ── Call-permission workflow ──────────────────────────────────────
// Shape a call record. The customer phone is included ONLY when the call is
// approved and the viewer is the assigned agent or an admin (so the agent can
// dial), per the admin-permission flow.
function shapeCall(c, { phone } = {}) {
  return {
    id: String(c._id),
    requestId: String(c.request?._id || c.request),
    requestNumber: c.request?.requestNumber,
    agentId: String(c.agent?._id || c.agent),
    agentName: c.agent?.name,
    customerName: c.request?.customer?.name,
    purpose: c.purpose,
    status: c.status,
    at: c.at,
    decidedAt: c.decidedAt,
    phone: phone, // present only for approved calls to authorised viewers
  };
}

// POST /api/requests/:id/call-requests  (agent assigned) — ask admin for permission
exports.requestCall = asyncHandler(async (req, res) => {
  const reqDoc = await ServiceRequest.findById(req.params.id).populate("customer", "name");
  if (!reqDoc) throw new ApiError(404, "Request not found");
  if (req.user.role === "agent" && String(reqDoc.assignedAgent) !== req.user.id) {
    throw new ApiError(403, "You can only request calls for tasks assigned to you");
  }
  const call = await CallLog.create({
    agent: req.user.id,
    request: reqDoc._id,
    purpose: req.body.purpose || "Call customer",
    status: "pending",
  });
  await notifyAdmins(
    `${req.user.name} requests permission to call the customer for ${reqDoc.requestNumber} — "${call.purpose}".`,
    "action",
    `#/admin/calls`
  );
  await audit(req.user, "call_permission_requested", "request", reqDoc._id, call.purpose);
  res.status(201).json({ success: true, call: shapeCall({ ...call.toObject(), request: reqDoc }) });
});

// GET /api/call-requests?status=pending  (admin)
exports.listCallRequests = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status && req.query.status !== "all") q.status = req.query.status;
  const list = await CallLog.find(q)
    .populate("agent", "name")
    .populate({ path: "request", select: "requestNumber customer", populate: { path: "customer", select: "name" } })
    .sort({ at: -1 })
    .limit(100);
  res.json({ success: true, calls: list.map((c) => shapeCall(c)) });
});

// PATCH /api/call-requests/:callId  { action: "approve" | "deny" }  (admin)
exports.decideCallRequest = asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!["approve", "deny"].includes(action)) throw new ApiError(400, "Invalid action");
  const call = await CallLog.findById(req.params.callId).populate({
    path: "request",
    select: "requestNumber customer",
    populate: { path: "customer", select: "name" },
  });
  if (!call) throw new ApiError(404, "Call request not found");
  if (call.status !== "pending") throw new ApiError(400, "This call request has already been decided");

  call.status = action === "approve" ? "approved" : "denied";
  call.approvedBy = req.user.id;
  call.decidedAt = new Date();
  await call.save();

  const reqNo = call.request?.requestNumber;
  if (action === "approve") {
    await notify(call.agent, `Approved: you may now call the customer for ${reqNo} — "${call.purpose}".`, "success", `#/agent/tasks/${call.request._id}`);
    await notify(call.request.customer._id, `Our agent will call you shortly regarding ${reqNo} (${call.purpose}). For your safety, never share any banking OTP, UPI PIN or password.`, "warning", `#/requests/${call.request._id}`);
  } else {
    await notify(call.agent, `Your request to call the customer for ${reqNo} was declined by admin.`, "info", `#/agent/tasks/${call.request._id}`);
  }
  await audit(req.user, action === "approve" ? "call_approved" : "call_denied", "request", call.request._id, call.purpose);
  res.json({ success: true, call: shapeCall(call) });
});

// GET /api/requests/:id/calls  — calls for one request (agent assigned / admin)
exports.listCalls = asyncHandler(async (req, res) => {
  const reqDoc = await ServiceRequest.findById(req.params.id).populate("customer", "name phone");
  if (!reqDoc) throw new ApiError(404, "Request not found");
  const isAdmin = req.user.role === "admin";
  const isAssignedAgent = req.user.role === "agent" && String(reqDoc.assignedAgent) === req.user.id;
  if (!isAdmin && !isAssignedAgent) throw new ApiError(403, "Not allowed");

  const list = await CallLog.find({ request: reqDoc._id }).populate("agent", "name").sort({ at: -1 });
  const calls = list.map((c) =>
    shapeCall({ ...c.toObject(), request: reqDoc, agent: c.agent },
      // reveal the number only for approved calls so the agent can dial
      c.status === "approved" ? { phone: reqDoc.customer.phone } : {})
  );
  res.json({ success: true, calls });
});

// PATCH /api/requests/:id/calls/:callId/complete  (agent) — mark the call as done
exports.completeCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findById(req.params.callId);
  if (!call) throw new ApiError(404, "Call not found");
  if (req.user.role === "agent" && String(call.agent) !== req.user.id) throw new ApiError(403, "Not allowed");
  if (call.status !== "approved") throw new ApiError(400, "Only an approved call can be marked complete");
  call.status = "completed";
  await call.save();
  await audit(req.user, "call_completed", "request", call.request, call.purpose);
  res.json({ success: true });
});
