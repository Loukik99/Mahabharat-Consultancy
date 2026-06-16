import { Link } from "react-router-dom";
import { getAdminStats, getAgentPerformance } from "@/api/stats.api";
import { listRequests } from "@/api/requests.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { getAuditLogs } from "@/api/audit.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  { to: "/admin/audit", label: "Audit" },
];

export function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            active === l.to
              ? "bg-orange-500 text-white"
              : "bg-orange-50 text-orange-700 hover:bg-orange-100"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const stats = getAdminStats();
  const performance = getAgentPerformance();
  const recent = listRequests().slice(0, 8);
  const audit = getAuditLogs({ limit: 6 });

  const cards = [
    { label: "Total Requests", value: stats.totalRequests, icon: ClipboardList, color: "bg-blue-100 text-blue-600" },
    { label: "Pending", value: stats.pendingRequests, icon: Clock, color: "bg-yellow-100 text-yellow-600" },
    { label: "Completed", value: stats.completedRequests, icon: CheckCircle, color: "bg-green-100 text-green-600" },
    { label: "Waiting Payment", value: stats.waitingPayment, icon: Wallet, color: "bg-orange-100 text-orange-600" },
    { label: "Payments Received", value: stats.paymentsReceived, icon: IndianRupee, color: "bg-emerald-100 text-emerald-600" },
    { label: "Customers", value: stats.totalCustomers, icon: Users, color: "bg-purple-100 text-purple-600" },
    { label: "Agents", value: stats.totalAgents, icon: UserCog, color: "bg-pink-100 text-pink-600" },
    { label: "Active Agents", value: stats.activeAgents, icon: UserCog, color: "bg-teal-100 text-teal-600" },
  ];

  const quickLinks = [
    { to: "/admin/requests", icon: ClipboardList, label: "Requests" },
    { to: "/admin/customers", icon: Users, label: "Customers" },
    { to: "/admin/agents", icon: UserCog, label: "Agents" },
    { to: "/admin/payments", icon: Wallet, label: "Payments" },
    { to: "/admin/services", icon: FileText, label: "Services" },
    { to: "/admin/reports", icon: BarChart3, label: "Reports" },
    { to: "/admin/audit", icon: ScrollText, label: "Audit Log" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Admin Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-5">Full overview of requests, agents, payments and activity</p>

      <AdminNav active="/admin" />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-7">
        {cards.map((s, i) => (
          <Card key={i}><CardContent className="pt-4 pb-3 text-center">
            <div className={`w-9 h-9 ${s.color} rounded-lg flex items-center justify-center mx-auto mb-1.5`}><s.icon size={18} /></div>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-7">
        {quickLinks.map((l) => (
          <Link key={l.to} to={l.to}>
            <Card className="hover:shadow-md transition-shadow h-full"><CardContent className="pt-4 pb-3 text-center">
              <l.icon className="mx-auto text-orange-500 mb-1.5" size={22} />
              <p className="font-semibold text-xs">{l.label}</p>
            </CardContent></Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Recent Requests</h2>
              <Link to="/admin/requests" className="text-orange-600 text-xs font-medium hover:underline">View All</Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Request #</TableHead><TableHead>Service</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.requestNumber}</TableCell>
                      <TableCell>{getService(r.serviceId)?.name ?? r.serviceId}</TableCell>
                      <TableCell>{getUser(r.userId)?.name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell><Link to={`/admin/requests/${r.id}`} className="text-orange-600"><Eye size={15} /></Link></TableCell>
                    </TableRow>
                  ))}
                  {recent.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No requests yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h2 className="font-semibold mb-3">Recent Activity</h2>
            <ul className="space-y-2.5">
              {audit.map((a) => {
                const actor = getUser(a.actorId);
                return (
                  <li key={a.id} className="text-xs border-l-2 border-orange-200 pl-2.5">
                    <p className="font-medium">{a.action.replace(/_/g, " ")}</p>
                    <p className="text-muted-foreground">
                      {(actor?.name ?? a.actorId)} ({a.actorRole}) · {new Date(a.at).toLocaleString("en-IN")}
                    </p>
                    {a.meta && <p className="text-muted-foreground">{a.meta}</p>}
                  </li>
                );
              })}
              {audit.length === 0 && <li className="text-xs text-muted-foreground">No activity recorded.</li>}
            </ul>
            <Link to="/admin/audit" className="text-orange-600 text-xs font-medium hover:underline mt-3 inline-block">View Audit Log</Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold mb-3">Agent Performance</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Agent</TableHead><TableHead>Assigned</TableHead><TableHead>Completed</TableHead><TableHead>Pending</TableHead><TableHead>Delayed</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {performance.map((p) => (
                  <TableRow key={p.agentId}>
                    <TableCell className="font-medium">{p.agentName}</TableCell>
                    <TableCell>{p.totalAssigned}</TableCell>
                    <TableCell className="text-green-600 font-medium">{p.completed}</TableCell>
                    <TableCell>{p.pending}</TableCell>
                    <TableCell className={p.delayed > 0 ? "text-red-600 font-bold" : ""}>{p.delayed}</TableCell>
                  </TableRow>
                ))}
                {performance.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No agents yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
