import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getAuditLogs } from "@/api/audit.api";
import { getUser } from "@/api/users.api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <Link key={l.to} to={l.to} className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${active === l.to ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100"}`}>{l.label}</Link>
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

  const allLogs = getAuditLogs();
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
        getUser(l.actorId)?.name ?? l.actorId, l.actorRole,
        l.action, l.targetType, l.targetId, l.meta ?? "",
      ]);
    });
    downloadCsv("audit-log.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log ({logs.length})</h1>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
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

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Meta</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.map((l) => {
              const actor = getUser(l.actorId);
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(l.at).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="font-medium">{actor?.name ?? l.actorId} <span className="text-muted-foreground font-normal">({l.actorRole})</span></TableCell>
                  <TableCell>{l.action.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-muted-foreground">{l.targetType} · {l.targetId}</TableCell>
                  <TableCell className="text-muted-foreground">{l.meta ?? "—"}</TableCell>
                </TableRow>
              );
            })}
            {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
