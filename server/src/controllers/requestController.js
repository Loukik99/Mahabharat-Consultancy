const path = require("path");
const fs = require("fs");
const { ServiceRequest, Service, Payment } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeRequest } = require("../utils/serializers");
const { audit, notify, nextRequestNumber } = require("../utils/helpers");
const { uploadRoot } = require("../middleware/upload");

const POPULATE = [
  { path: "customer", select: "name email phone address" },
  { path: "service", select: "name" },
  { path: "assignedAgent", select: "name" },
];

const EDITABLE = ["submitted", "documents_required"];

async function loadRequest(id) {
  const r = await ServiceRequest.findById(id).populate(POPULATE);
  if (!r) throw new ApiError(404, "Request not found");
  return r;
}

// Enforce who may view/act on a request.
function authorize(user, r) {
  if (user.role === "admin") return;
  if (user.role === "agent" && String(r.assignedAgent?._id || r.assignedAgent) === user.id) return;
  if (user.role === "customer" && String(r.customer?._id || r.customer) === user.id) return;
  throw new ApiError(403, "You do not have access to this request");
}

// GET /api/requests  — scoped by role
exports.list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.user.role === "customer") q.customer = req.user.id;
  else if (req.user.role === "agent") q.assignedAgent = req.user.id;
  // admin: all
  if (req.query.status && req.query.status !== "all") q.status = req.query.status;
  if (req.query.category && req.query.category !== "all") q.category = req.query.category;

  const list = await ServiceRequest.find(q).populate(POPULATE).sort({ createdAt: -1 });
  res.json({ success: true, requests: list.map((r) => serializeRequest(r, req.user.role)) });
});

// GET /api/requests/:id
exports.get = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

// POST /api/requests  (customer)
exports.create = asyncHandler(async (req, res) => {
  const { serviceId, applicantDetails, notes } = req.body;
  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) throw new ApiError(400, "Invalid service");

  const r = await ServiceRequest.create({
    requestNumber: await nextRequestNumber(),
    customer: req.user.id,
    service: service._id,
    category: service.category,
    applicantDetails,
    notes: notes || "",
    priceLabel: service.priceLabel,
    statusHistory: [{ status: "submitted", by: req.user.id, byRole: "customer" }],
  });
  await audit(req.user, "request_created", "request", r._id, r.requestNumber);
  const full = await loadRequest(r._id);
  res.status(201).json({ success: true, request: serializeRequest(full, "customer") });
});

// PATCH /api/requests/:id  (customer, while editable)
exports.update = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !EDITABLE.includes(r.status)) {
    throw new ApiError(400, "This request can no longer be edited");
  }
  if (req.body.notes !== undefined) r.notes = req.body.notes;
  if (req.body.applicantDetails !== undefined) r.applicantDetails = req.body.applicantDetails;
  await r.save();
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

// POST /api/requests/:id/documents  (multipart: file, label)  customer/admin
exports.uploadDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (!req.file) throw new ApiError(400, "No file uploaded");

  r.documents.push({
    label: req.body.label || req.file.originalname,
    fileName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedByRole: req.user.role,
    uploadedBy: req.user.id,
  });
  await r.save();
  await audit(req.user, "document_uploaded", "request", r._id, req.file.originalname);
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

// DELETE /api/requests/:id/documents/:docId  (customer while editable / admin)
exports.removeDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !EDITABLE.includes(r.status)) {
    throw new ApiError(400, "Documents can no longer be changed");
  }
  const doc = r.documents.id(req.params.docId);
  if (doc) {
    safeUnlink(doc.storedName);
    doc.deleteOne();
    await r.save();
  }
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

// GET /api/requests/:id/documents/:docId/download
exports.downloadDocument = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  const doc = r.documents.id(req.params.docId);
  if (!doc) throw new ApiError(404, "File not found");
  await audit(req.user, "file_download", "file", doc._id, `doc ${doc.fileName}`);
  sendFile(res, doc);
});

// POST /api/requests/:id/deliverables  (multipart: file)  agent assigned / admin
exports.uploadDeliverable = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer") throw new ApiError(403, "Only agents upload completed files");
  if (!req.file) throw new ApiError(400, "No file uploaded");

  r.deliverables.push({
    fileName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedByAgent: req.user.id,
  });
  await r.save();
  await audit(req.user, "deliverable_uploaded", "request", r._id, req.file.originalname);
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

// GET /api/requests/:id/deliverables/:delId/download
// PAYMENT-GATED: customers can only download after admin marks payment received.
exports.downloadDeliverable = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && !r.paymentApprovedByAdmin) {
    throw new ApiError(403, "Files unlock after the shop confirms your payment");
  }
  const del = r.deliverables.id(req.params.delId);
  if (!del) throw new ApiError(404, "File not found");
  await audit(req.user, "file_download", "file", del._id, `deliverable ${del.fileName}`);
  sendFile(res, del);
});

// PATCH /api/requests/:id/status  (agent assigned / admin)
exports.setStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!ServiceRequest.REQUEST_STATUSES.includes(status)) throw new ApiError(400, "Invalid status");
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer" && status !== "cancelled") throw new ApiError(403, "Not allowed");

  r.status = status;
  r.statusHistory.push({ status, by: req.user.id, byRole: req.user.role, note });
  await r.save();
  await audit(req.user, "status_change", "request", r._id, `${r.requestNumber} → ${status}`);
  await notify(r.customer._id || r.customer, `Your request ${r.requestNumber} is now "${status.replace(/_/g, " ")}".`, "info", `#/requests/${r._id}`);
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

// PATCH /api/requests/:id/assign  (admin)
exports.assignAgent = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  r.assignedAgent = req.body.agentId;
  if (r.status === "submitted") r.status = "in_review";
  await r.save();
  await audit(req.user, "assign_agent", "request", r._id, `${r.requestNumber} → agent ${req.body.agentId}`);
  const full = await loadRequest(r._id);
  res.json({ success: true, request: serializeRequest(full, req.user.role) });
});

// POST /api/requests/:id/comments
exports.addComment = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  const internal = req.user.role !== "customer" && !!req.body.internal;
  r.comments.push({ by: req.user.id, byRole: req.user.role, message: req.body.message, internal });
  await r.save();
  if (!internal && req.user.role !== "customer") {
    await notify(r.customer._id || r.customer, `New remark on ${r.requestNumber}.`, "info", `#/requests/${r._id}`);
  }
  res.status(201).json({ success: true, request: serializeRequest(r, req.user.role) });
});

// PATCH /api/requests/:id/ready  (agent) — work done, move to waiting_payment
exports.markReadyForPayment = asyncHandler(async (req, res) => {
  const r = await loadRequest(req.params.id);
  authorize(req.user, r);
  if (req.user.role === "customer") throw new ApiError(403, "Not allowed");
  if (!r.deliverables.length) throw new ApiError(400, "Upload the completed file before marking ready");

  r.statusHistory.push({ status: "completed", by: req.user.id, byRole: req.user.role });
  r.status = "waiting_payment";
  r.statusHistory.push({ status: "waiting_payment", by: req.user.id, byRole: req.user.role });
  await r.save();
  await notify(r.customer._id || r.customer, `${r.requestNumber} is ready. Please complete payment.`, "warning", `#/requests/${r._id}`);
  await audit(req.user, "ready_for_payment", "request", r._id, r.requestNumber);
  res.json({ success: true, request: serializeRequest(r, req.user.role) });
});

// ── file helpers ──────────────────────────────────────────────────
function sendFile(res, doc) {
  const full = path.join(uploadRoot, doc.storedName || "");
  if (!doc.storedName || !fs.existsSync(full)) throw new ApiError(404, "File is no longer available");
  res.download(full, doc.fileName);
}
function safeUnlink(storedName) {
  if (!storedName) return;
  fs.promises.unlink(path.join(uploadRoot, storedName)).catch(() => {});
}
