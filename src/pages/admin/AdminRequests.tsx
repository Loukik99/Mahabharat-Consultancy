import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import type { RequestStatus, ServiceCategoryId } from "@/types";
import { REQUEST_STATUS_FLOW } from "@/types";
import { listRequests, labelForStatus } from "@/api/requests.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { serviceCategories } from "@/data/catalog";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Filter, Search } from "lucide-react";

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

function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${active === l.to ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100"}`}>
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

  const requests = useMemo(() => listRequests({ status, category }), [status, category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const customer = getUser(r.userId)?.name ?? "";
      return r.requestNumber.toLowerCase().includes(q) || customer.toLowerCase().includes(q);
    });
  }, [requests, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">All Requests ({filtered.length})</h1>
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

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Request #</TableHead><TableHead>Service</TableHead><TableHead>Customer</TableHead><TableHead>Agent</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const agent = r.assignedAgentId ? getUser(r.assignedAgentId) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.requestNumber}</TableCell>
                  <TableCell>{getService(r.serviceId)?.name ?? r.serviceId}</TableCell>
                  <TableCell>{getUser(r.userId)?.name ?? "—"}</TableCell>
                  <TableCell>{agent ? agent.name : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><Link to={`/admin/requests/${r.id}`} className="text-orange-600 flex items-center gap-1 text-xs"><Eye size={14} /> View</Link></TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No requests found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
