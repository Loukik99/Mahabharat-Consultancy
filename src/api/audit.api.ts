import type { AuditLog } from "@/types";
import { auditLogs } from "@/data/store";

export function getAuditLogs(opts?: { targetId?: string; action?: string; limit?: number }): AuditLog[] {
  let list = [...auditLogs];
  if (opts?.targetId) list = list.filter((l) => l.targetId === opts.targetId);
  if (opts?.action) list = list.filter((l) => l.action === opts.action);
  list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return opts?.limit ? list.slice(0, opts.limit) : list;
}
