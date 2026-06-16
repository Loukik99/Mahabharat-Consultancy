const { maskPhone } = require("./helpers");

const idOf = (ref) => (ref && ref._id ? String(ref._id) : ref ? String(ref) : undefined);
const nameOf = (ref) => (ref && ref.name ? ref.name : undefined);

function serializeUser(u, viewerRole = "admin") {
  if (!u) return null;
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    phone: viewerRole === "admin" ? u.phone : maskPhone(u.phone, viewerRole),
    role: u.role,
    address: u.address,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

function serializeCategory(c) {
  return {
    id: c.key,
    name: c.name,
    nameHi: c.nameHi,
    description: c.description,
    icon: c.icon,
    accent: c.accent,
    isActive: c.isActive,
  };
}

function serializeService(s) {
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    description: s.description,
    category: s.category,
    priceLabel: s.priceLabel,
    requiredDocuments: s.requiredDocuments || [],
    officialLinks: (s.officialLinks || []).map((l) => ({ label: l.label, url: l.url, note: l.note })),
    processingTime: s.processingTime,
    popular: s.popular,
    isActive: s.isActive,
  };
}

// viewerRole controls visibility of internal comments and phone masking.
function serializeRequest(r, viewerRole = "customer") {
  const base = `/api/requests/${r._id}`;
  return {
    id: String(r._id),
    requestNumber: r.requestNumber,
    userId: idOf(r.customer),
    customerName: nameOf(r.customer),
    serviceId: idOf(r.service),
    serviceName: nameOf(r.service),
    category: r.category,
    status: r.status,
    applicantDetails: r.applicantDetails,
    notes: r.notes,
    adminNotes: viewerRole === "customer" ? undefined : r.adminNotes,
    assignedAgentId: idOf(r.assignedAgent),
    assignedAgentName: nameOf(r.assignedAgent),
    documents: (r.documents || []).map((d) => ({
      id: String(d._id),
      label: d.label,
      fileName: d.fileName,
      url: `${base}/documents/${d._id}/download`,
      uploadedByRole: d.uploadedByRole,
      uploadedAt: d.uploadedAt,
    })),
    deliverables: (r.deliverables || []).map((d) => ({
      id: String(d._id),
      fileName: d.fileName,
      url: `${base}/deliverables/${d._id}/download`,
      uploadedAt: d.uploadedAt,
    })),
    statusHistory: (r.statusHistory || []).map((h) => ({
      status: h.status,
      byRole: h.byRole,
      note: h.note,
      at: h.at,
    })),
    comments: (r.comments || [])
      .filter((c) => viewerRole !== "customer" || !c.internal)
      .map((c) => ({
        id: String(c._id),
        byRole: c.byRole,
        message: c.message,
        internal: c.internal,
        at: c.at,
      })),
    priceLabel: r.priceLabel,
    isPaid: r.isPaid,
    paymentApprovedByAdmin: r.paymentApprovedByAdmin,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function serializePayment(p) {
  return {
    id: String(p._id),
    requestId: idOf(p.request),
    requestNumber: p.request && p.request.requestNumber,
    userId: idOf(p.customer),
    customerName: nameOf(p.customer),
    amountLabel: p.amountLabel,
    method: p.method,
    status: p.status,
    createdAt: p.createdAt,
  };
}

function serializeNotification(n) {
  return { id: String(n._id), message: n.message, type: n.type, read: n.read, link: n.link, at: n.at };
}

function serializeAudit(a) {
  return {
    id: String(a._id),
    actorId: idOf(a.actor),
    actorName: nameOf(a.actor),
    actorRole: a.actorRole,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    meta: a.meta,
    at: a.at,
  };
}

function serializeCallLog(c) {
  return { id: String(c._id), requestId: idOf(c.request), purpose: c.purpose, status: c.status, at: c.at };
}

module.exports = {
  serializeUser,
  serializeCategory,
  serializeService,
  serializeRequest,
  serializePayment,
  serializeNotification,
  serializeAudit,
  serializeCallLog,
};
