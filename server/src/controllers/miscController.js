const { User, ServiceRequest, Payment, AuditLog, Notification, CallLog } = require("../models");
const { asyncHandler, ApiError } = require("../utils/apiError");
const { serializeNotification, serializeAudit, serializeCallLog } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const env = require("../config/env");

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

// ── Secure masked OTP call (agent) ────────────────────────────────
// POST /api/requests/:id/call
exports.requestOtpCall = asyncHandler(async (req, res) => {
  const reqDoc = await ServiceRequest.findById(req.params.id);
  if (!reqDoc) throw new ApiError(404, "Request not found");
  if (String(reqDoc.assignedAgent) !== req.user.id) {
    throw new ApiError(403, "You can only call customers for tasks assigned to you");
  }
  // The provider bridges the call WITHOUT exposing the customer's number.
  // With CALL_PROVIDER=stub we just log it; real providers (Exotel/Twilio) plug in here.
  const call = await CallLog.create({
    agent: req.user.id,
    request: reqDoc._id,
    purpose: req.body.purpose || "OTP request",
    status: env.callProvider === "stub" ? "connected" : "requested",
    provider: env.callProvider,
  });
  await audit(req.user, "otp_call_requested", "request", reqDoc._id, call.purpose);
  res.status(201).json({ success: true, call: serializeCallLog(call) });
});

// GET /api/requests/:id/calls
exports.listCalls = asyncHandler(async (req, res) => {
  const list = await CallLog.find({ request: req.params.id }).sort({ at: -1 });
  res.json({ success: true, calls: list.map(serializeCallLog) });
});
