import type { ServiceRequest, RequestStatus } from "@/types";
import { api } from "@/lib/apiClient";

// ── Queries ───────────────────────────────────────────────────────
// The backend scopes results by the caller's role/token, so callers no
// longer pass userId/agentId — only optional admin filters.
export async function listRequests(filter?: { status?: string; category?: string }): Promise<ServiceRequest[]> {
  const { data } = await api.get<{ requests: ServiceRequest[] }>("/requests", { params: filter });
  return data.requests;
}

export async function getRequest(id: string): Promise<ServiceRequest | null> {
  try {
    const { data } = await api.get<{ request: ServiceRequest }>(`/requests/${id}`);
    return data.request;
  } catch {
    return null;
  }
}

// ── Mutations ─────────────────────────────────────────────────────
export async function createRequest(input: {
  serviceId: string;
  applicantDetails?: ServiceRequest["applicantDetails"];
  notes?: string;
}): Promise<ServiceRequest> {
  const { data } = await api.post<{ request: ServiceRequest }>("/requests", input);
  return data.request;
}

export async function updateRequest(id: string, patch: Partial<Pick<ServiceRequest, "notes" | "applicantDetails">>): Promise<ServiceRequest> {
  const { data } = await api.patch<{ request: ServiceRequest }>(`/requests/${id}`, patch);
  return data.request;
}

export async function setStatus(id: string, status: RequestStatus, note?: string): Promise<ServiceRequest> {
  const { data } = await api.patch<{ request: ServiceRequest }>(`/requests/${id}/status`, { status, note });
  return data.request;
}

export async function assignAgent(id: string, agentId: string): Promise<ServiceRequest> {
  const { data } = await api.patch<{ request: ServiceRequest }>(`/requests/${id}/assign`, { agentId });
  return data.request;
}

export async function addComment(id: string, comment: { message: string; internal?: boolean }): Promise<ServiceRequest> {
  const { data } = await api.post<{ request: ServiceRequest }>(`/requests/${id}/comments`, comment);
  return data.request;
}

export async function markReadyForPayment(id: string): Promise<ServiceRequest> {
  const { data } = await api.patch<{ request: ServiceRequest }>(`/requests/${id}/ready`, {});
  return data.request;
}

// ── Documents & deliverables ──────────────────────────────────────
export async function uploadDocument(id: string, file: File, label: string): Promise<ServiceRequest> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  const { data } = await api.post<{ request: ServiceRequest }>(`/requests/${id}/documents`, form);
  return data.request;
}

export async function removeDocument(id: string, docId: string): Promise<ServiceRequest> {
  const { data } = await api.delete<{ request: ServiceRequest }>(`/requests/${id}/documents/${docId}`);
  return data.request;
}

export async function uploadDeliverable(id: string, file: File): Promise<ServiceRequest> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ request: ServiceRequest }>(`/requests/${id}/deliverables`, form);
  return data.request;
}

// Authenticated downloads — fetch as a blob (the endpoints require the bearer
// token, so a plain <a href> won't work) and trigger a save.
async function download(path: string, fallbackName: string) {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDocument(requestId: string, docId: string, fileName: string) {
  return download(`/requests/${requestId}/documents/${docId}/download`, fileName);
}

export function downloadDeliverable(requestId: string, delId: string, fileName: string) {
  return download(`/requests/${requestId}/deliverables/${delId}/download`, fileName);
}

// ── Pure display/logic helpers (no network) ───────────────────────
export function isEditable(r: ServiceRequest): boolean {
  return ["submitted", "documents_required"].includes(r.status);
}

export function canDownload(r: ServiceRequest): boolean {
  return r.paymentApprovedByAdmin === true;
}

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
