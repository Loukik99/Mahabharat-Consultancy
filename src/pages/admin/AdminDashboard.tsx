import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ServiceRequest, AuditLog, AgentPerformance } from "@/types";
import { getAdminStats, getAgentPerformance, type AdminStats } from "@/api/stats.api";
import { listRequests } from "@/api/requests.api";
import { getAuditLogs } from "@/api/audit.api";
import { getCustomers, getAgents } from "@/api/users.api";
import { serviceById } from "@/data/catalog";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import {
  ClipboardList, Clock, CheckCircle, Wallet, Users, UserCog, FileText,
  BarChart3, ScrollText, Eye, IndianRupee,
} from "lucide-react";

// ── Shared admin nav (inlined in every admin page) ─────────────────
const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/requests", label: "Requests" },
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/agents", label: "Agents" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/services", label: "Services" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/calls", label: "Calls" },
  { to: "/admin/audit", label: "Audit" },
];

export function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
            active === l.to
              ? "bg-navy text-white"
              : "bg-secondary text-muted-foreground hover:text-navy"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [recent, setRecent] = useState<ServiceRequest[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, perf, reqs, logs, customers, agents] = await Promise.all([
          getAdminStats(),
          getAgentPerformance(),
          listRequests({}),
          getAuditLogs({ limit: 6 }),
          getCustomers(),
          getAgents(),
        ]);
        if (!active) return;
        setStats(s);
        setPerformance(perf);
        setRecent(reqs.slice(0, 8));
        setAudit(logs);
        const map: Record<string, string> = {};
        [...customers, ...agents].forEach((u) => { map[u.id] = u.name; });
        setNameById(map);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const cards = stats ? [
    { label: "Total Requests", value: stats.totalRequests, icon: ClipboardList },
    { label: "Pending", value: stats.pendingRequests, icon: Clock },
    { label: "Completed", value: stats.completedRequests, icon: CheckCircle },
    { label: "Waiting Payment", value: stats.waitingPayment, icon: Wallet },
    { label: "Payments Received", value: stats.paymentsReceived, icon: IndianRupee },
    { label: "Customers", value: stats.totalCustomers, icon: Users },
    { label: "Agents", value: stats.totalAgents, icon: UserCog },
    { label: "Active Agents", value: stats.activeAgents, icon: UserCog },
  ] : [];

  const quickLinks = [
    { to: "/admin/requests", icon: ClipboardList, label: "Requests" },
    { to: "/admin/customers", icon: Users, label: "Customers" },
    { to: "/admin/agents", icon: UserCog, label: "Agents" },
    { to: "/admin/payments", icon: Wallet, label: "Payments" },
    { to: "/admin/services", icon: FileText, label: "Services" },
    { to: "/admin/reports", icon: BarChart3, label: "Reports" },
    { to: "/admin/audit", icon: ScrollText, label: "Audit Log" },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <p className="eyebrow text-gold">Admin</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-navy mb-1">Admin Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-5">Full overview of requests, agents, payments and activity</p>

      <AdminNav active="/admin" />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-7">
        {cards.map((s, i) => (
          <div key={i} className="bg-card border border-border rounded p-4 text-center">
            <div className="w-9 h-9 bg-navy text-gold rounded flex items-center justify-center mx-auto mb-2"><s.icon size={18} /></div>
            <p className="font-display text-2xl font-semibold text-navy tnum">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-7">
        {quickLinks.map((l) => (
          <Link key={l.to} to={l.to} className="group bg-card border border-border rounded p-4 text-center transition-colors hover:bg-secondary/40 hover:border-gold">
            <l.icon className="mx-auto text-gold mb-1.5" size={22} />
            <p className="font-semibold text-xs text-navy">{l.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-navy">Recent Requests</h2>
            <Link to="/admin/requests" className="text-gold text-xs font-medium hover:underline">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2 pr-3">Request #</th><th className="text-left font-medium py-2 pr-3">Service</th><th className="text-left font-medium py-2 pr-3">Customer</th><th className="text-left font-medium py-2 pr-3">Status</th><th className="py-2"></th>
              </tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="py-2.5 pr-3 font-medium text-navy">{r.requestNumber}</td>
                    <td className="py-2.5 pr-3">{serviceById(r.serviceId)?.name ?? r.serviceId}</td>
                    <td className="py-2.5 pr-3">{nameById[r.userId] ?? "—"}</td>
                    <td className="py-2.5 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2.5"><Link to={`/admin/requests/${r.id}`} className="text-navy hover:text-gold"><Eye size={15} /></Link></td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded p-5">
          <h2 className="font-display text-lg font-semibold text-navy mb-3">Recent Activity</h2>
          <ul className="space-y-2.5">
            {audit.map((a) => (
              <li key={a.id} className="text-xs border-l-2 border-gold/40 pl-2.5">
                <p className="font-medium text-navy">{a.action.replace(/_/g, " ")}</p>
                <p className="text-muted-foreground">
                  {(nameById[a.actorId] ?? a.actorId)} ({a.actorRole}) · {new Date(a.at).toLocaleString("en-IN")}
                </p>
                {a.meta && <p className="text-muted-foreground">{a.meta}</p>}
              </li>
            ))}
            {audit.length === 0 && <li className="text-xs text-muted-foreground">No activity recorded.</li>}
          </ul>
          <Link to="/admin/audit" className="text-gold text-xs font-medium hover:underline mt-3 inline-block">View Audit Log</Link>
        </div>
      </div>

      <div className="mt-5 bg-card border border-border rounded p-5">
        <h2 className="font-display text-lg font-semibold text-navy mb-3">Agent Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2 pr-3">Agent</th><th className="text-right font-medium py-2 pr-3">Assigned</th><th className="text-right font-medium py-2 pr-3">Completed</th><th className="text-right font-medium py-2 pr-3">Pending</th><th className="text-right font-medium py-2">Delayed</th>
            </tr></thead>
            <tbody>
              {performance.map((p) => (
                <tr key={p.agentId} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="py-2.5 pr-3 font-medium text-navy">{p.agentName}</td>
                  <td className="py-2.5 pr-3 text-right tnum">{p.totalAssigned}</td>
                  <td className="py-2.5 pr-3 text-right tnum text-emerald-600 font-medium">{p.completed}</td>
                  <td className="py-2.5 pr-3 text-right tnum">{p.pending}</td>
                  <td className={`py-2.5 text-right tnum ${p.delayed > 0 ? "text-destructive font-bold" : ""}`}>{p.delayed}</td>
                </tr>
              ))}
              {performance.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No agents yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
