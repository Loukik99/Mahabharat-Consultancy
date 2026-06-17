import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { RequestStatus, ServiceCategoryId, ServiceRequest, Payment, User, AgentPerformance } from "@/types";
import { getAdminStats, getAgentPerformance, type AdminStats } from "@/api/stats.api";
import { listRequests, labelForStatus } from "@/api/requests.api";
import { getPayments } from "@/api/payments.api";
import { getCustomers, getAgents } from "@/api/users.api";
import { serviceById, serviceCategories, categoryById } from "@/data/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" }, { to: "/admin/requests", label: "Requests" },
  { to: "/admin/customers", label: "Customers" }, { to: "/admin/agents", label: "Agents" },
  { to: "/admin/payments", label: "Payments" }, { to: "/admin/services", label: "Services" },
  { to: "/admin/reports", label: "Reports" }, { to: "/admin/audit", label: "Audit" },
];

function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6 print:hidden">
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

const STATUSES: RequestStatus[] = [
  "submitted", "documents_required", "in_review", "in_progress",
  "waiting_otp", "waiting_payment", "completed", "delivered", "rejected", "cancelled",
];

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [agents, setAgents] = useState<User[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, perf, reqs, pays, custs, agentList] = await Promise.all([
          getAdminStats(),
          getAgentPerformance(),
          listRequests({}),
          getPayments(),
          getCustomers(),
          getAgents(),
        ]);
        if (!active) return;
        setStats(s);
        setPerformance(perf);
        setRequests(reqs);
        setPayments(pays);
        setCustomers(custs);
        setAgents(agentList);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const nameById = (uid: string) =>
    customers.find((u) => u.id === uid)?.name ?? agents.find((u) => u.id === uid)?.name ?? "";

  const countByCategory = serviceCategories.map((c) => ({
    category: c.name,
    count: requests.filter((r) => r.category === (c.id as ServiceCategoryId)).length,
  }));
  const countByStatus = STATUSES.map((s) => ({
    status: labelForStatus(s),
    count: requests.filter((r) => r.status === s).length,
  }));

  const exportRequests = () => {
    const rows: (string | number)[][] = [["Request #", "Service", "Category", "Customer", "Agent", "Status", "Paid", "Created"]];
    requests.forEach((r) => {
      const agent = r.assignedAgentId ? nameById(r.assignedAgentId) : "Unassigned";
      rows.push([
        r.requestNumber, serviceById(r.serviceId)?.name ?? r.serviceId,
        categoryById(r.category)?.name ?? r.category,
        nameById(r.userId), agent,
        labelForStatus(r.status), r.paymentApprovedByAdmin ? "Yes" : "No",
        new Date(r.createdAt).toLocaleDateString("en-IN"),
      ]);
    });
    downloadCsv("requests-report.csv", rows);
  };

  const exportPayments = () => {
    const rows: (string | number)[][] = [["Request #", "Customer", "Method", "Amount", "Status", "Date"]];
    payments.forEach((p) => {
      rows.push([
        requests.find((r) => r.id === p.requestId)?.requestNumber ?? p.requestId,
        nameById(p.userId), p.method.toUpperCase(), p.amountLabel, p.status,
        new Date(p.createdAt).toLocaleDateString("en-IN"),
      ]);
    });
    downloadCsv("payments-report.csv", rows);
  };

  const exportAgents = () => {
    const rows: (string | number)[][] = [["Name", "Email", "Phone", "Assigned", "Completed", "Pending", "Delayed", "Active"]];
    agents.forEach((a) => {
      const p = performance.find((x) => x.agentId === a.id);
      rows.push([a.name, a.email, a.phone, p?.totalAssigned ?? 0, p?.completed ?? 0, p?.pending ?? 0, p?.delayed ?? 0, a.isActive ? "Yes" : "No"]);
    });
    downloadCsv("agents-report.csv", rows);
  };

  if (loading || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-5 print:hidden">Summary report with export options</p>

      <AdminNav active="/admin/reports" />

      <div className="flex flex-wrap gap-2 mb-6 print:hidden">
        <Button size="sm" variant="outline" onClick={exportRequests}><Download size={14} className="mr-1" /> Export Requests CSV</Button>
        <Button size="sm" variant="outline" onClick={exportPayments}><Download size={14} className="mr-1" /> Export Payments CSV</Button>
        <Button size="sm" variant="outline" onClick={exportAgents}><Download size={14} className="mr-1" /> Export Agents CSV</Button>
        <Button size="sm" onClick={() => window.print()}><Printer size={14} className="mr-1" /> Print / Save as PDF</Button>
      </div>

      {/* Print-friendly summary section */}
      <div id="report-print">
        <div className="hidden print:block mb-4">
          <h2 className="text-xl font-bold">Mahabharat Consultancy — Summary Report</h2>
          <p className="text-xs text-muted-foreground">Generated {new Date().toLocaleString("en-IN")}</p>
        </div>

        <Card className="mb-5"><CardContent className="pt-5">
          <h2 className="font-semibold mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <p><span className="text-muted-foreground">Total Requests:</span> <strong>{stats.totalRequests}</strong></p>
            <p><span className="text-muted-foreground">Pending:</span> <strong>{stats.pendingRequests}</strong></p>
            <p><span className="text-muted-foreground">Completed:</span> <strong>{stats.completedRequests}</strong></p>
            <p><span className="text-muted-foreground">Waiting Payment:</span> <strong>{stats.waitingPayment}</strong></p>
            <p><span className="text-muted-foreground">Payments Received:</span> <strong>{stats.paymentsReceived}</strong></p>
            <p><span className="text-muted-foreground">Customers:</span> <strong>{stats.totalCustomers}</strong></p>
            <p><span className="text-muted-foreground">Agents:</span> <strong>{stats.totalAgents}</strong></p>
            <p><span className="text-muted-foreground">Active Agents:</span> <strong>{stats.activeAgents}</strong></p>
          </div>
        </CardContent></Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Card><CardContent className="pt-5">
            <h2 className="font-semibold mb-3">Requests by Category</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {countByCategory.map((c) => (
                  <TableRow key={c.category}><TableCell>{c.category}</TableCell><TableCell>{c.count}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>

          <Card><CardContent className="pt-5">
            <h2 className="font-semibold mb-3">Requests by Status</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {countByStatus.map((s) => (
                  <TableRow key={s.status}><TableCell>{s.status}</TableCell><TableCell>{s.count}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </div>

        <Card><CardContent className="pt-5">
          <h2 className="font-semibold mb-3">Agent Performance</h2>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Agent</TableHead><TableHead>Assigned</TableHead><TableHead>Completed</TableHead><TableHead>Pending</TableHead><TableHead>Delayed</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {performance.map((p) => (
                <TableRow key={p.agentId}>
                  <TableCell className="font-medium">{p.agentName}</TableCell>
                  <TableCell>{p.totalAssigned}</TableCell>
                  <TableCell>{p.completed}</TableCell>
                  <TableCell>{p.pending}</TableCell>
                  <TableCell className={p.delayed > 0 ? "text-red-600 font-bold" : ""}>{p.delayed}</TableCell>
                </TableRow>
              ))}
              {performance.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No agents.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </div>
  );
}
