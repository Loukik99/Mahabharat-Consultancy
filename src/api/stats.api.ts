import type { AgentPerformance } from "@/types";
import { api } from "@/lib/apiClient";

export interface AdminStats {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  waitingPayment: number;
  paymentsReceived: number;
  totalCustomers: number;
  totalAgents: number;
  activeAgents: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<{ stats: AdminStats }>("/stats/admin");
  return data.stats;
}

export async function getAgentPerformance(): Promise<AgentPerformance[]> {
  const { data } = await api.get<{ performance: AgentPerformance[] }>("/stats/agents");
  return data.performance;
}
