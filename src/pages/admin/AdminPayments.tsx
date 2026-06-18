import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Payment, ServiceRequest, User } from "@/types";
import { getPayments, markPaymentReceived } from "@/api/payments.api";
import { listRequests } from "@/api/requests.api";
import { getCustomers } from "@/api/users.api";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, CheckCircle, Wallet, Clock } from "lucide-react";

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" }, { to: "/admin/requests", label: "Requests" },
  { to: "/admin/customers", label: "Customers" }, { to: "/admin/agents", label: "Agents" },
  { to: "/admin/payments", label: "Payments" }, { to: "/admin/services", label: "Services" },
  { to: "/admin/reports", label: "Reports" }, { to: "/admin/calls", label: "Calls" },
  { to: "/admin/audit", label: "Audit" },
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

export default function AdminPayments() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);

  const load = async () => {
    try {
      const [pays, reqs, custs] = await Promise.all([getPayments(), listRequests({}), getCustomers()]);
      setPayments(pays);
      setRequests(reqs);
      setCustomers(custs);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [pays, reqs, custs] = await Promise.all([getPayments(), listRequests({}), getCustomers()]);
        if (!active) return;
        setPayments(pays);
        setRequests(reqs);
        setCustomers(custs);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const requestFor = (requestId: string) => requests.find((r) => r.id === requestId);
  const customerName = (userId: string) => customers.find((c) => c.id === userId)?.name ?? "—";

  const received = payments.filter((p) => p.status === "received").length;
  const pending = payments.filter((p) => p.status === "pending").length;

  if (!user) return null;

  const handleMark = async (requestId: string) => {
    try {
      await markPaymentReceived(requestId);
      toast.success("Payment marked received — downloads unlocked & delivered");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Request #", "Customer", "Method", "Amount", "Status", "Date"]];
    payments.forEach((p) => {
      rows.push([
        requestFor(p.requestId)?.requestNumber ?? p.requestId,
        customerName(p.userId),
        p.method.toUpperCase(), p.amountLabel, p.status,
        new Date(p.createdAt).toLocaleDateString("en-IN"),
      ]);
    });
    downloadCsv("payments.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="eyebrow text-gold">Finance</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">Payments ({payments.length})</h1>
        </div>
        <Button size="sm" variant="outline" className="border-border text-navy hover:border-gold hover:text-gold" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Verify and record payments. Marking received unlocks the customer&apos;s downloads.</p>

      <AdminNav active="/admin/payments" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-navy text-gold rounded flex items-center justify-center mx-auto mb-1.5"><Wallet size={18} /></div>
          <p className="font-display text-2xl text-navy tnum">{payments.length}</p><p className="text-[10px] text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center mx-auto mb-1.5"><CheckCircle size={18} /></div>
          <p className="font-display text-2xl text-navy tnum">{received}</p><p className="text-[10px] text-muted-foreground">Received</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <div className="w-9 h-9 bg-amber-100 text-amber-600 rounded flex items-center justify-center mx-auto mb-1.5"><Clock size={18} /></div>
          <p className="font-display text-2xl text-navy tnum">{pending}</p><p className="text-[10px] text-muted-foreground">Pending</p>
        </CardContent></Card>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-4 py-3">Request #</th>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const req = requestFor(p.requestId);
                return (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="px-4 py-3 font-medium">
                      {req ? <Link to={`/admin/requests/${req.id}`} className="text-gold hover:underline">{req.requestNumber}</Link> : p.requestId}
                    </td>
                    <td className="px-4 py-3">{customerName(p.userId)}</td>
                    <td className="px-4 py-3 uppercase text-xs">{p.method}</td>
                    <td className="px-4 py-3 text-right tnum">{p.amountLabel}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right text-muted-foreground tnum">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      {p.status === "pending"
                        ? <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90 h-7 text-xs" onClick={() => handleMark(p.requestId)}>Mark Received</Button>
                        : <span className="text-emerald-600 text-xs flex items-center gap-1"><CheckCircle size={13} /> Done</span>}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No payments yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
