import { api } from "@/lib/apiClient";

export interface CallRecord {
  id: string;
  requestId: string;
  requestNumber?: string;
  agentId: string;
  agentName?: string;
  customerName?: string;
  purpose: string;
  status: "pending" | "approved" | "denied" | "completed";
  at: string;
  decidedAt?: string;
  phone?: string; // present only for approved calls, to the assigned agent/admin
}

// ── Agent ─────────────────────────────────────────────────────────
// Request admin permission to call the customer.
export async function requestCall(requestId: string, purpose: string): Promise<CallRecord> {
  const { data } = await api.post<{ call: CallRecord }>(`/requests/${requestId}/call-requests`, { purpose });
  return data.call;
}

export async function getCallLogs(requestId: string): Promise<CallRecord[]> {
  const { data } = await api.get<{ calls: CallRecord[] }>(`/requests/${requestId}/calls`);
  return data.calls;
}

export async function completeCall(requestId: string, callId: string): Promise<void> {
  await api.patch(`/requests/${requestId}/calls/${callId}/complete`, {});
}

// ── Admin ─────────────────────────────────────────────────────────
export async function listCallRequests(status?: string): Promise<CallRecord[]> {
  const { data } = await api.get<{ calls: CallRecord[] }>("/call-requests", { params: { status } });
  return data.calls;
}

export async function decideCallRequest(callId: string, action: "approve" | "deny"): Promise<CallRecord> {
  const { data } = await api.patch<{ call: CallRecord }>(`/call-requests/${callId}`, { action });
  return data.call;
}
