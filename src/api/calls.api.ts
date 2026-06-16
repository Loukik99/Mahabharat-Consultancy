import type { CallLog } from "@/types";
import { callLogs, requests, uid, persist, logAudit } from "@/data/store";

// ──────────────────────────────────────────────────────────────────
// Secure masked-calling / OTP request flow.
//
// PHASE 1 STUB: this simulates a click-to-call without ever exposing
// the customer's real number to the agent. In Phase 5 the connect()
// step is wired to a masked-calling provider (Exotel / Twilio /
// Knowlarity) — the agent triggers a call that the provider bridges,
// so the agent never sees or dials the actual number.
//
// SECURITY RULES enforced in the UI:
//  • Agents may only request a call for a task assigned to them.
//  • The real phone number is NEVER returned to the agent.
//  • Every call is logged (agent, task, purpose, time).
//  • OTPs are never stored in plain text (we do not store them at all).
//  • Agents must never ask for banking OTPs, UPI PINs, or passwords.
// ──────────────────────────────────────────────────────────────────

export function requestOtpCall(requestId: string, agentId: string, purpose: string): CallLog {
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error("Request not found");
  if (req.assignedAgentId !== agentId) throw new Error("You can only call customers for tasks assigned to you");

  const call: CallLog = {
    id: uid("call"),
    agentId,
    requestId,
    purpose,
    status: "requested",
    at: new Date().toISOString(),
  };
  callLogs.unshift(call);
  logAudit(agentId, "agent", "otp_call_requested", "request", requestId, purpose);
  persist();

  // Provider bridge would happen here; we mark it connected for the demo.
  call.status = "connected";
  persist();
  return call;
}

export function getCallLogs(requestId?: string): CallLog[] {
  const list = requestId ? callLogs.filter((c) => c.requestId === requestId) : [...callLogs];
  return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
