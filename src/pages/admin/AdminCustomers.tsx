import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User, ServiceRequest } from "@/types";
import { getCustomers, setUserActive, deleteUser } from "@/api/users.api";
import { listRequests } from "@/api/requests.api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Download } from "lucide-react";

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

export default function AdminCustomers() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<User[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [toDelete, setToDelete] = useState<User | null>(null);

  const load = async () => {
    try {
      const [custs, reqs] = await Promise.all([getCustomers(), listRequests({})]);
      setCustomers(custs);
      setRequests(reqs);
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
        const [custs, reqs] = await Promise.all([getCustomers(), listRequests({})]);
        if (!active) return;
        setCustomers(custs);
        setRequests(reqs);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const reqCount = (id: string) => requests.filter((r) => r.userId === id).length;

  if (!user) return null;

  const handleToggle = async (c: User) => {
    try {
      await setUserActive(c.id, !c.isActive);
      toast.success(c.isActive ? "Customer deactivated" : "Customer activated");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteUser(toDelete.id);
      toast.success("Customer deleted");
      setToDelete(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Name", "Email", "Phone", "City", "Joined", "Requests", "Active"]];
    customers.forEach((c) => rows.push([
      c.name, c.email, c.phone, c.address?.city ?? "",
      new Date(c.createdAt).toLocaleDateString("en-IN"), reqCount(c.id), c.isActive ? "Yes" : "No",
    ]));
    downloadCsv("customers.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="eyebrow text-gold">Admin</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Customers ({customers.length})</h1>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Manage customer accounts</p>

      <AdminNav active="/admin/customers" />

      <div className="bg-card border border-border rounded p-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2 pr-3">Name</th><th className="text-left font-medium py-2 pr-3">Email</th><th className="text-left font-medium py-2 pr-3">Phone</th><th className="text-left font-medium py-2 pr-3">City</th><th className="text-right font-medium py-2 pr-3">Joined</th><th className="text-right font-medium py-2 pr-3">Requests</th><th className="text-left font-medium py-2 pr-3">Active</th><th className="py-2"></th>
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="py-2.5 pr-3 font-medium text-navy">{c.name}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{c.email}</td>
                  <td className="py-2.5 pr-3 tnum">{c.phone}</td>
                  <td className="py-2.5 pr-3">{c.address?.city ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right text-muted-foreground tnum">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-2.5 pr-3 text-right tnum">{reqCount(c.id)}</td>
                  <td className="py-2.5 pr-3"><Switch checked={c.isActive} onCheckedChange={() => handleToggle(c)} /></td>
                  <td className="py-2.5"><button onClick={() => setToDelete(c)} className="text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No customers yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete customer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes <strong>{toDelete?.name}</strong>. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
