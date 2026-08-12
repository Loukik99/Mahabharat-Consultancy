const { ServiceRequest, Service } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeRequest } = require("../utils/serializers");
const { audit, notify, nextRequestNumber } = require("../utils/helpers");
const { persistFile, sendStoredFile, removeStoredFile } = require("../utils/storage");
const { assertSafeUpload } = require("../utils/fileMagic");
const { pick } = require("../utils/sanitize");

const POPULATE = [
  { path: "customer", select: "name email phone address" },
  { path: "service", select: "name" },
  { path: "assignedAgent", select: "name" },
];

const EDITABLE = ["submitted", "documents_required"];
const TERMINAL = ["delivered", "rejected", "cancelled"];

/** Statuses an assigned agent may set directly (payment/delivery remain admin paths). */
const AGENT_STATUSES = new Set([
  "documents_required",
  "in_review",
  "in_progress",
  "waiting_otp",
  "rejected",
]);

async function loadRequest(id) {
  const r = await ServiceRequest.findById(id).populate(POPULATE);
  if (!r) throw new ApiError(404, "Request not found");
  return r;
}

function authorize(user, r) {
  if (user.role === "admin") return;
  if (user.role === "agent" && String(r.assignedAgent?._id || r.assignedAgent) === user.id) return;
  if (user.role === "customer" && String(r.customer?._id || r.customer) === user.id) return;
  throw new ApiError(403, "You do not have access to this request");
}

exports.list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.user.role === "customer") q.customer = req.user.id;
  else if (req.user.role === "agent") q.assignedAgent = req.user.id;
  if (req.query.status && req.query.status !== "all") {
    if (!ServiceRequest.REQUEST_STATUSES.includes(req.query.status)) {
      throw new ApiError(400, "Invalid status filter");
    }
    q.status = req.query.status;
  }
  if (req.query.category && req.query.category !== "all") q.category = String(req.query.category).slice(0, 64);

  const list = await ServiceRequest.find(q).populate(POPULATE).sort({ createdAt: -1 });
  res.json({ success: true, requests: list.map((r) => serializeRequest(r, req.user.role)) });
});

exports.get = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.create = asyncHandler(async (req, res) => {
  const { serviceId, applicantDetails, notes } = req.body;
  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) throw new ApiError(400, "Invalid service");

  const details = pick(applicantDetails || {}, [
    "fullName",
    "fatherName",
    "dob",
    "referenceNumber",
    "additionalInfo",
  ]);

  const r = await ServiceRequest.create({
    requestNumber: await nextRequestNumber(),
    customer: req.user.id,
    service: service._id,
    category: service.category,
    applicantDetails: details,
    notes: typeof notes === "string" ? notes.slice(0, 2000) : "",
    priceLabel: service.priceLabel,
    statusHistory: [{ status: "submitted", by: req.user.id, byRole: "customer" }],
  });
  await audit(req.user, "request_created", "request", r._id, r.requestNumber);
  const full = await loadRequest(r._id);
  res.status(201).json({ success: true, request: serializeRequest(full, "customer") });
});

exports.update = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);

  if (req.user.role === "customer") {
    if (!EDITABLE.includes(r.status)) throw new ApiError(400, "This request can no longer be edited");
    if (req.body.notes !== undefined) r.notes = String(req.body.notes).slice(0, 2000);
    if (req.body.applicantDetails !== undefined) {
      r.applicantDetails = pick(req.body.applicantDetails || {}, [
        "fullName",
        "fatherName",
        "dob",
        "referenceNumber",
        "additionalInfo",
      ]);
    }
  } else if (req.user.role === "agent") {
    if (TERMINAL.includes(r.status)) throw new ApiError(400, "This request can no longer be edited");
    // Agents may only update notes — never applicant identity fields.
    if (req.body.notes !== undefined) r.notes = String(req.body.notes).slice(0, 2000);
  } else {
    // admin
    if (req.body.notes !== undefined) r.notes = String(req.body.notes).slice(0, 2000);
    if (req.body.adminNotes !== undefined) r.adminNotes = String(req.body.adminNotes).slice(0, 2000);
    if (req.body.applicantDetails !== undefined) {
      r.applicantDetails = pick(req.body.applicantDetails || {}, [
        "fullName",
        "fatherName",
        "dob",
        "referenceNumber",
        "additionalInfo",
      ]);
    }
  }

  await r.save();
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !EDITABLE.includes(r.status)) {
    throw new ApiError(400, "Documents can no longer be uploaded for this request");
  }
  if (req.user.role === "agent" && TERMINAL.includes(r.status)) {
    throw new ApiError(400, "Documents can no longer be uploaded for this request");
  }
  if (!req.file) throw new ApiError(400, "No file uploaded");
  assertSafeUpload(req.file);

  const meta = await persistFile(req.file);
  r.documents.push({
    label: String(req.body.label || req.file.originalname).slice(0, 120),
    ...meta,
    uploadedByRole: req.user.role,
    uploadedBy: req.user.id,
  });
  await r.save();
  await audit(req.user, "document_uploaded", "request", r._id, meta.fileName);
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.removeDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !EDITABLE.includes(r.status)) {
    throw new ApiError(400, "Documents can no longer be changed");
  }
  if (req.user.role === "agent" && !EDITABLE.includes(r.status)) {
    throw new ApiError(400, "Documents can no longer be changed");
  }
  const doc = r.documents.id(req.params.docId);
  if (doc) {
    await removeStoredFile(doc);
    doc.deleteOne();
    await r.save();
  }
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.downloadDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  const doc = r.documents.id(req.params.docId);
  if (!doc) throw new ApiError(404, "File not found");
  await audit(req.user, "file_download", "file", doc._id, `doc ${doc.fileName}`);
  await sendStoredFile(res, doc);
});

exports.uploadDeliverable = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer") throw new ApiError(403, "Only agents upload completed files");
  if (TERMINAL.includes(r.status) && r.status !== "waiting_payment") {
    // allow uploads while waiting_payment to replace deliverable; block after delivered
  }
  if (r.status === "delivered" || r.status === "cancelled" || r.status === "rejected") {
    throw new ApiError(400, "Cannot upload deliverables for this request status");
  }
  if (!req.file) throw new ApiError(400, "No file uploaded");
  assertSafeUpload(req.file);

  const meta = await persistFile(req.file);
  r.deliverables.push({ ...meta, uploadedByAgent: req.user.id });
  await r.save();
  await audit(req.user, "deliverable_uploaded", "request", r._id, meta.fileName);
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.downloadDeliverable = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !r.paymentApprovedByAdmin) {
    throw new ApiError(403, "Files unlock after the shop confirms your payment");
  }
  const del = r.deliverables.id(req.params.delId);
  if (!del) throw new ApiError(404, "File not found");
  await audit(req.user, "file_download", "file", del._id, `deliverable ${del.fileName}`);
  await sendStoredFile(res, del);
});

exports.setStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!ServiceRequest.REQUEST_STATUSES.includes(status)) throw new ApiError(400, "Invalid status");
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);

  if (req.user.role === "customer") {
    if (status !== "cancelled") throw new ApiError(403, "Not allowed");
    if (TERMINAL.includes(r.status) || r.status === "waiting_payment") {
      throw new ApiError(400, "This request can no longer be cancelled");
    }
  } else if (req.user.role === "agent") {
    if (!AGENT_STATUSES.has(status)) {
      throw new ApiError(
        403,
        "Agents cannot set this status. Use Mark Ready for payment, or ask an admin."
      );
    }
  }
  // admin: any valid status (payment unlock still via markReceived for deliverables)

  r.status = status;
  r.statusHistory.push({
    status,
    by: req.user.id,
    byRole: req.user.role,
    note: note ? String(note).slice(0, 500) : undefined,
  });
  await r.save();
  await audit(req.user, "status_change", "request", r._id, `${r.requestNumber} → ${status}`);
  await notify(
    r.customer._id || r.customer,
    `Your request ${r.requestNumber} is now "${status.replace(/_/g, " ")}".`,
    "info",
    `/requests/${r._id}`
  );
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.assignAgent = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  const agentId = req.body.agentId;
  if (!agentId) throw new ApiError(400, "agentId is required");
  const { User } = require("../models");
  const agent = await User.findById(agentId);
  if (!agent || agent.role !== "agent" || !agent.isActive) {
    throw new ApiError(400, "Invalid agent");
  }
  r.assignedAgent = agent._id;
  if (r.status === "submitted") r.status = "in_review";
  await r.save();
  await audit(req.user, "assign_agent", "request", r._id, `${r.requestNumber} → agent ${agentId}`);
  const full = await loadRequest(r._id);
  res.json({ success: true, request: serializeRequest(full, req.user.role) });
});

exports.addComment = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  const message = String(req.body.message || "").trim().slice(0, 2000);
  if (!message) throw new ApiError(400, "Message is required");
  const internal = req.user.role !== "customer" && !!req.body.internal;
  r.comments.push({ by: req.user.id, byRole: req.user.role, message, internal });
  await r.save();
  if (!internal && req.user.role !== "customer") {
    await notify(r.customer._id || r.customer, `New remark on ${r.requestNumber}.`, "info", `/requests/${r._id}`);
  }
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

exports.markReadyForPayment = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer") throw new ApiError(403, "Not allowed");
  if (!r.deliverables.length) throw new ApiError(400, "Upload the completed file before marking ready");
  if (r.status === "delivered" || r.status === "cancelled") {
    throw new ApiError(400, "Invalid status transition");
  }

  r.statusHistory.push({ status: "completed", by: req.user.id, byRole: req.user.role });
  r.status = "waiting_payment";
  r.statusHistory.push({ status: "waiting_payment", by: req.user.id, byRole: req.user.role });
  await r.save();
  await notify(
    r.customer._id || r.customer,
    `${r.requestNumber} is ready. Please complete payment.`,
    "warning",
    `/requests/${r._id}`
  );
  await audit(req.user, "ready_for_payment", "request", r._id, r.requestNumber);
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});
