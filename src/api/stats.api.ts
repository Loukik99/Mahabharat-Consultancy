import type { AgentPerformance } from "@/types";
import { users, requests, payments } from "@/data/store";

const PENDING: string[] = ["submitted", "documents_required", "in_review", "in_progress", "waiting_otp", "waiting_payment"];
const DONE: string[] = ["completed", "delivered"];

export function getAdminStats() {
  return {
    totalRequests: requests.length,
    pendingRequests: requests.filter((r) => PENDING.includes(r.status)).length,
    completedRequests: requests.filter((r) => DONE.includes(r.status)).length,
    waitingPayment: requests.filter((r) => r.status === "waiting_payment").length,
    paymentsReceived: payments.filter((p) => p.status === "received").length,
    totalCustomers: users.filter((u) => u.role === "customer").length,
    totalAgents: users.filter((u) => u.role === "agent").length,
    activeAgents: users.filter((u) => u.role === "agent" && u.isActive).length,
  };
}

/** Delayed = open for more than this many days without completion. */
const DELAY_DAYS = 4;

export function getAgentPerformance(): AgentPerformance[] {
  const agents = users.filter((u) => u.role === "agent");
  const nowMs = Date.now();
  return agents.map((a) => {
    const mine = requests.filter((r) => r.assignedAgentId === a.id);
    const pending = mine.filter((r) => PENDING.includes(r.status));
    const delayed = pending.filter((r) => (nowMs - new Date(r.createdAt).getTime()) / 86400000 > DELAY_DAYS);
    return {
      agentId: a.id,
      agentName: a.name,
      totalAssigned: mine.length,
      completed: mine.filter((r) => DONE.includes(r.status)).length,
      pending: pending.length,
      delayed: delayed.length,
    };
  });
}
