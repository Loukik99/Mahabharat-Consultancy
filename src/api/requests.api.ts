import type {
  ServiceRequest, RequestStatus, RequestFilter, Role, RequestDocument,
} from "@/types";
import { requests, uid, persist, nextRequestNumber, logAudit, notify } from "@/data/store";
import { PRICE_PLACEHOLDER } from "@/data/catalog";

const touch = (r: ServiceRequest) => { r.updatedAt = new Date().toISOString(); };

export function listRequests(filter?: RequestFilter): ServiceRequest[] {
  let list = [...requests];
  if (filter?.userId) list = list.filter((r) => r.userId === filter.userId);
  if (filter?.agentId) list = list.filter((r) => r.assignedAgentId === filter.agentId);
  if (filter?.status && filter.status !== "all") list = list.filter((r) => r.status === filter.status);
  if (filter?.category && filter.category !== "all") list = list.filter((r) => r.category === filter.category);
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getRequest(id: string): ServiceRequest | null {
  return requests.find((r) => r.id === id) || null;
}

export function createRequest(data: {
  userId: string;
  serviceId: string;
  category: ServiceRequest["category"];
  applicantDetails?: ServiceRequest["applicantDetails"];
  notes?: string;
}): ServiceRequest {
  const at = new Date().toISOString();
  const req: ServiceRequest = {
    id: uid("r"),
    requestNumber: nextRequestNumber(),
    userId: data.userId,
    serviceId: data.serviceId,
    category: data.category,
    status: "submitted",
    applicantDetails: data.applicantDetails,
    notes: data.notes || "",
    adminNotes: "",
    documents: [],
    deliverables: [],
    comments: [],
    statusHistory: [{ status: "submitted", byUserId: data.userId, byRole: "customer", at }],
    priceLabel: PRICE_PLACEHOLDER,
    isPaid: false,
    paymentApprovedByAdmin: false,
    createdAt: at,
    updatedAt: at,
  };
  requests.push(req);
  logAudit(data.userId, "customer", "request_created", "request", req.id, req.requestNumber);
  persist();
  return req;
}

/** Customer edits allowed only before an agent starts work. */
export function isEditable(r: ServiceRequest): boolean {
  return ["submitted", "documents_required"].includes(r.status);
}

export function updateRequest(id: string, patch: Partial<Pick<ServiceRequest, "notes" | "applicantDetails">>): ServiceRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  Object.assign(r, patch);
  touch(r);
  persist();
  return r;
}

export function setStatus(id: string, status: RequestStatus, actor: { id: string; role: Role }, note?: string): ServiceRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.status = status;
  r.statusHistory.push({ status, byUserId: actor.id, byRole: actor.role, note, at: new Date().toISOString() });
  touch(r);
  logAudit(actor.id, actor.role, "status_change", "request", r.id, `${r.requestNumber} → ${status}`);
  notify(r.userId, `Your request ${r.requestNumber} is now "${labelForStatus(status)}".`, statusTone(status), `#/requests/${r.id}`);
  persist();
  return r;
}

export function assignAgent(id: string, agentId: string, admin: { id: string }): ServiceRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.assignedAgentId = agentId;
  if (r.status === "submitted") r.status = "in_review";
  touch(r);
  logAudit(admin.id, "admin", "assign_agent", "request", r.id, `${r.requestNumber} → agent ${agentId}`);
  persist();
  return r;
}

export function addDocument(id: string, doc: { label: string; fileName: string; url: string }, role: Role): RequestDocument | null {
  const r = getRequest(id);
  if (!r) return null;
  const d: RequestDocument = { id: uid("d"), ...doc, uploadedByRole: role, uploadedAt: new Date().toISOString() };
  r.documents.push(d);
  touch(r);
  persist();
  return d;
}

export function removeDocument(id: string, docId: string): void {
  const r = getRequest(id);
  if (!r) return;
  r.documents = r.documents.filter((d) => d.id !== docId);
  touch(r);
  persist();
}

export function addDeliverable(id: string, file: { fileName: string; url: string }, agentId: string): void {
  const r = getRequest(id);
  if (!r) return;
  r.deliverables.push({ id: uid("del"), ...file, uploadedByAgentId: agentId, uploadedAt: new Date().toISOString() });
  touch(r);
  logAudit(agentId, "agent", "deliverable_uploaded", "request", r.id, file.fileName);
  persist();
}

export function addComment(id: string, comment: { byUserId: string; byRole: Role; message: string; internal?: boolean }): void {
  const r = getRequest(id);
  if (!r) return;
  r.comments.push({ id: uid("c"), ...comment, at: new Date().toISOString() });
  touch(r);
  if (!comment.internal && comment.byRole !== "customer") {
    notify(r.userId, `New remark on ${r.requestNumber}: "${comment.message}"`, "info", `#/requests/${r.id}`);
  }
  persist();
}

/** Agent finished work → request enters the payment stage. */
export function markReadyForPayment(id: string, agent: { id: string }): ServiceRequest | null {
  setStatus(id, "completed", { id: agent.id, role: "agent" });
  return setStatus(id, "waiting_payment", { id: agent.id, role: "agent" });
}

/** Downloads of final files are gated on admin-approved payment. */
export function canDownload(r: ServiceRequest): boolean {
  return r.paymentApprovedByAdmin === true;
}

// ── Display helpers ───────────────────────────────────────────────
export function labelForStatus(s: RequestStatus): string {
  const map: Record<RequestStatus, string> = {
    submitted: "Submitted",
    documents_required: "Documents Required",
    in_review: "In Review",
    in_progress: "In Progress",
    waiting_otp: "Waiting for OTP",
    waiting_payment: "Waiting for Payment",
    completed: "Completed",
    delivered: "Delivered",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return map[s] ?? s;
}

function statusTone(s: RequestStatus): "info" | "action" | "success" | "warning" {
  if (s === "documents_required" || s === "waiting_otp") return "action";
  if (s === "waiting_payment") return "warning";
  if (s === "delivered" || s === "completed") return "success";
  return "info";
}
