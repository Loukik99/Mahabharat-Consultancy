import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RequestStatus, ServiceCategoryId, ServiceRequest } from "@/types";
import { REQUEST_STATUS_FLOW } from "@/types";
import { listRequests, labelForStatus } from "@/api/requests.api";
import { getCustomers, getAgents } from "@/api/users.api";
import { serviceById, serviceCategories } from "@/data/catalog";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Eye, Filter, Search } from "lucide-react";

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

function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${active === l.to ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"}`}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

const ALL_STATUSES: RequestStatus[] = [...REQUEST_STATUS_FLOW, "rejected", "cancelled"];

export default function AdminRequests() {
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [category, setCategory] = useState<ServiceCategoryId | "all">("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [reqs, customers, agents] = await Promise.all([
          listRequests({}),
          getCustomers(),
          getAgents(),
        ]);
        if (!active) return;
        setRequests(reqs);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (category !== "all" && r.category !== category) return false;
      if (q) {
        const customer = (nameById[r.userId] ?? "").toLowerCase();
        if (!r.requestNumber.toLowerCase().includes(q) && !customer.includes(q)) return false;
      }
      return true;
    });
  }, [requests, nameById, status, category, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <p className="eyebrow text-gold">Admin</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-navy mb-1">All Requests ({filtered.length})</h1>
      <p className="text-sm text-muted-foreground mb-5">View, filter and open any service request</p>

      <AdminNav active="/admin/requests" />

      <Card className="mb-5"><CardContent className="pt-4 pb-3 flex flex-wrap gap-3 items-center">
        <Filter size={16} className="text-muted-foreground" />
        <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus | "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelForStatus(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => setCategory(v as ServiceCategoryId | "all")}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {serviceCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by request # or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardContent></Card>

      <div className="bg-card border border-border rounded p-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2 pr-3">Request #</th><th className="text-left font-medium py-2 pr-3">Service</th><th className="text-left font-medium py-2 pr-3">Customer</th><th className="text-left font-medium py-2 pr-3">Agent</th><th className="text-left font-medium py-2 pr-3">Status</th><th className="text-right font-medium py-2 pr-3">Created</th><th className="py-2"></th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const agentName = r.assignedAgentId ? nameById[r.assignedAgentId] : null;
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="py-2.5 pr-3 font-medium text-navy">{r.requestNumber}</td>
                    <td className="py-2.5 pr-3">{serviceById(r.serviceId)?.name ?? r.serviceId}</td>
                    <td className="py-2.5 pr-3">{nameById[r.userId] ?? "—"}</td>
                    <td className="py-2.5 pr-3">{agentName ? agentName : <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="py-2.5 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground tnum">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="py-2.5"><Link to={`/admin/requests/${r.id}`} className="text-navy hover:text-gold flex items-center gap-1 text-xs"><Eye size={14} /> View</Link></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No requests found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
