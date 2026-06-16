import { useState } from "react";
import { Link } from "react-router-dom";
import { getPayments, markPaymentReceived } from "@/api/payments.api";
import { getRequest } from "@/api/requests.api";
import { getUser } from "@/api/users.api";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, CheckCircle, Wallet, Clock } from "lucide-react";

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

export default function AdminPayments() {
  const { user } = useAuth();
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);

  const payments = getPayments();
  const received = payments.filter((p) => p.status === "received").length;
  const pending = payments.filter((p) => p.status === "pending").length;

  if (!user) return null;

  const handleMark = (requestId: string) => {
    markPaymentReceived(requestId, { id: user.id });
    toast.success("Payment marked received — downloads unlocked & delivered");
    refresh();
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Request #", "Customer", "Method", "Amount", "Status", "Date"]];
    payments.forEach((p) => {
      const req = getRequest(p.requestId);
      rows.push([
        req?.requestNumber ?? p.requestId,
        getUser(p.userId)?.name ?? "",
        p.method.toUpperCase(), p.amountLabel, p.status,
        new Date(p.createdAt).toLocaleDateString("en-IN"),
      ]);
    });
    downloadCsv("payments.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments ({payments.length})</h1>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Verify and record payments. Marking received unlocks the customer&apos;s downloads.</p>

      <AdminNav active="/admin/payments" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mx-auto mb-1.5"><Wallet size={18} /></div>
          <p className="text-lg font-bold">{payments.length}</p><p className="text-[10px] text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mx-auto mb-1.5"><CheckCircle size={18} /></div>
          <p className="text-lg font-bold">{received}</p><p className="text-[10px] text-muted-foreground">Received</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-yellow-100 text-yellow-600 rounded-lg flex items-center justify-center mx-auto mb-1.5"><Clock size={18} /></div>
          <p className="text-lg font-bold">{pending}</p><p className="text-[10px] text-muted-foreground">Pending</p>
        </CardContent></Card>
      </div>

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Request #</TableHead><TableHead>Customer</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {payments.map((p) => {
              const req = getRequest(p.requestId);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {req ? <Link to={`/admin/requests/${req.id}`} className="text-orange-600 hover:underline">{req.requestNumber}</Link> : p.requestId}
                  </TableCell>
                  <TableCell>{getUser(p.userId)?.name ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{p.method}</TableCell>
                  <TableCell>{p.amountLabel}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>
                    {p.status === "pending"
                      ? <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => handleMark(p.requestId)}>Mark Received</Button>
                      : <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle size={13} /> Done</span>}
                  </TableCell>
                </TableRow>
              );
            })}
            {payments.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
