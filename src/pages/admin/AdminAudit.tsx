import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AuditLog } from "@/types";
import { getAuditLogs } from "@/api/audit.api";
import { getCustomers, getAgents } from "@/api/users.api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Filter } from "lucide-react";

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" }, { to: "/admin/requests", label: "Requests" },
  { to: "/admin/customers", label: "Customers" }, { to: "/admin/agents", label: "Agents" },
  { to: "/admin/payments", label: "Payments" }, { to: "/admin/services", label: "Services" },
  { to: "/admin/reports", label: "Reports" }, { to: "/admin/audit", label: "Audit" },
];

function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${active === l.to ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"}`}>{l.label}</Link>
      ))}
    </div>
  );
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAudit() {
  const [action, setAction] = useState("all");
  const [loading, setLoading] = useState(true);
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [logs, customers, agents] = await Promise.all([
          getAuditLogs({ limit: 200 }),
          getCustomers(),
          getAgents(),
        ]);
        if (!active) return;
        setAllLogs(logs);
        const map: Record<string, string> = {};
        [...customers, ...agents].forEach((u) => { map[u.id] = u.name; });
        setNameById(map);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const actorName = (id: string) => nameById[id] ?? id;

  const actions = useMemo(() => Array.from(new Set(allLogs.map((l) => l.action))).sort(), [allLogs]);
  const logs = useMemo(
    () => (action === "all" ? allLogs : allLogs.filter((l) => l.action === action)),
    [allLogs, action],
  );

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Time", "Actor", "Role", "Action", "Target Type", "Target ID", "Meta"]];
    logs.forEach((l) => {
      rows.push([
        new Date(l.at).toLocaleString("en-IN"),
        actorName(l.actorId), l.actorRole,
        l.action, l.targetType, l.targetId, l.meta ?? "",
      ]);
    });
    downloadCsv("audit-log.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="eyebrow text-gold">System</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">Audit Log ({logs.length})</h1>
        </div>
        <Button size="sm" variant="outline" className="border-border text-navy hover:border-gold hover:text-gold" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">All recorded admin, agent and customer activity</p>

      <AdminNav active="/admin/audit" />

      <Card className="mb-5"><CardContent className="pt-4 pb-3 flex flex-wrap gap-3 items-center">
        <Filter size={16} className="text-muted-foreground" />
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-4 py-3">Time</th>
                <th className="text-left font-medium px-4 py-3">Actor</th>
                <th className="text-left font-medium px-4 py-3">Action</th>
                <th className="text-left font-medium px-4 py-3">Target</th>
                <th className="text-left font-medium px-4 py-3">Meta</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tnum">{new Date(l.at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 font-medium">{actorName(l.actorId)} <span className="text-muted-foreground font-normal">({l.actorRole})</span></td>
                  <td className="px-4 py-3">{l.action.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.targetType} · {l.targetId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.meta ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
