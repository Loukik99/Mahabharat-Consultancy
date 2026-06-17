import type { AuditLog } from "@/types";
import { api } from "@/lib/apiClient";

export async function getAuditLogs(opts?: { action?: string; limit?: number }): Promise<AuditLog[]> {
  const { data } = await api.get<{ logs: AuditLog[] }>("/audit", { params: opts });
  return data.logs;
}
