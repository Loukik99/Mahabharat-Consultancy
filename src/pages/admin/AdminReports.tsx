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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="print:hidden mb-1">
        <p className="eyebrow text-gold">Insights</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">Reports</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5 print:hidden">Summary report with export options</p>

      <AdminNav active="/admin/reports" />

      <div className="flex flex-wrap gap-2 mb-6 print:hidden">
        <Button size="sm" variant="outline" className="border-border text-navy hover:border-gold hover:text-gold" onClick={exportRequests}><Download size={14} className="mr-1" /> Export Requests CSV</Button>
        <Button size="sm" variant="outline" className="border-border text-navy hover:border-gold hover:text-gold" onClick={exportPayments}><Download size={14} className="mr-1" /> Export Payments CSV</Button>
        <Button size="sm" variant="outline" className="border-border text-navy hover:border-gold hover:text-gold" onClick={exportAgents}><Download size={14} className="mr-1" /> Export Agents CSV</Button>
        <Button size="sm" onClick={() => window.print()}><Printer size={14} className="mr-1" /> Print / Save as PDF</Button>
      </div>

      {/* Print-friendly summary section */}
      <div id="report-print">
        <div className="hidden print:block mb-4">
          <h2 className="font-display text-xl font-semibold text-navy">Mahabharat Consultancy — Summary Report</h2>
          <p className="text-xs text-muted-foreground">Generated {new Date().toLocaleString("en-IN")}</p>
        </div>

        <Card className="mb-5"><CardContent className="pt-5">
          <h2 className="font-display text-lg font-semibold text-navy mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <p><span className="text-muted-foreground">Total Requests:</span> <strong className="text-navy tnum">{stats.totalRequests}</strong></p>
            <p><span className="text-muted-foreground">Pending:</span> <strong className="text-navy tnum">{stats.pendingRequests}</strong></p>
            <p><span className="text-muted-foreground">Completed:</span> <strong className="text-navy tnum">{stats.completedRequests}</strong></p>
            <p><span className="text-muted-foreground">Waiting Payment:</span> <strong className="text-navy tnum">{stats.waitingPayment}</strong></p>
            <p><span className="text-muted-foreground">Payments Received:</span> <strong className="text-navy tnum">{stats.paymentsReceived}</strong></p>
            <p><span className="text-muted-foreground">Customers:</span> <strong className="text-navy tnum">{stats.totalCustomers}</strong></p>
            <p><span className="text-muted-foreground">Agents:</span> <strong className="text-navy tnum">{stats.totalAgents}</strong></p>
            <p><span className="text-muted-foreground">Active Agents:</span> <strong className="text-navy tnum">{stats.activeAgents}</strong></p>
          </div>
        </CardContent></Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Card><CardContent className="pt-5">
            <h2 className="font-display text-lg font-semibold text-navy mb-3">Requests by Category</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-2">Category</th>
                  <th className="text-right font-medium py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {countByCategory.map((c) => (
                  <tr key={c.category} className="border-b border-border/60"><td className="py-2">{c.category}</td><td className="py-2 text-right tnum">{c.count}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>

          <Card><CardContent className="pt-5">
            <h2 className="font-display text-lg font-semibold text-navy mb-3">Requests by Status</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-2">Status</th>
                  <th className="text-right font-medium py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {countByStatus.map((s) => (
                  <tr key={s.status} className="border-b border-border/60"><td className="py-2">{s.status}</td><td className="py-2 text-right tnum">{s.count}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </div>

        <Card><CardContent className="pt-5">
          <h2 className="font-display text-lg font-semibold text-navy mb-3">Agent Performance</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2">Agent</th>
                <th className="text-right font-medium py-2">Assigned</th>
                <th className="text-right font-medium py-2">Completed</th>
                <th className="text-right font-medium py-2">Pending</th>
                <th className="text-right font-medium py-2">Delayed</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((p) => (
                <tr key={p.agentId} className="border-b border-border/60">
                  <td className="py-2 font-medium">{p.agentName}</td>
                  <td className="py-2 text-right tnum">{p.totalAssigned}</td>
                  <td className="py-2 text-right tnum">{p.completed}</td>
                  <td className="py-2 text-right tnum">{p.pending}</td>
                  <td className={`py-2 text-right tnum ${p.delayed > 0 ? "text-destructive font-bold" : ""}`}>{p.delayed}</td>
                </tr>
              ))}
              {performance.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No agents.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </div>
  );
}
