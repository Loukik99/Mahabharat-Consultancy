import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User, AgentPerformance } from "@/types";
import { getAgents, createAgent, setUserActive, deleteUser } from "@/api/users.api";
import { getAgentPerformance } from "@/api/stats.api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Download } from "lucide-react";

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

const emptyForm = { name: "", email: "", phone: "", password: "" };

export default function AdminAgents() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<User[]>([]);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<User | null>(null);

  const load = async () => {
    try {
      const [agentList, perf] = await Promise.all([getAgents(), getAgentPerformance()]);
      setAgents(agentList);
      setPerformance(perf);
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
        const [agentList, perf] = await Promise.all([getAgents(), getAgentPerformance()]);
        if (!active) return;
        setAgents(agentList);
        setPerformance(perf);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const perfFor = (id: string) => performance.find((p) => p.agentId === id);

  if (!user) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAgent({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      toast.success("Agent added");
      setForm(emptyForm);
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add agent");
    }
  };

  const handleToggle = async (a: User) => {
    try {
      await setUserActive(a.id, !a.isActive);
      toast.success(a.isActive ? "Agent deactivated" : "Agent activated");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteUser(toDelete.id);
      toast.success("Agent deleted");
      setToDelete(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Name", "Email", "Phone", "Assigned", "Completed", "Pending", "Delayed", "Active"]];
    agents.forEach((a) => {
      const p = perfFor(a.id);
      rows.push([a.name, a.email, a.phone, p?.totalAssigned ?? 0, p?.completed ?? 0, p?.pending ?? 0, p?.delayed ?? 0, a.isActive ? "Yes" : "No"]);
    });
    downloadCsv("agents.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="eyebrow text-gold">Admin</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Agents ({agents.length})</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus size={14} className="mr-1" /> Add Agent</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Manage agents and view performance</p>

      <AdminNav active="/admin/agents" />

      <div className="bg-card border border-border rounded p-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2 pr-3">Name</th><th className="text-left font-medium py-2 pr-3">Email</th><th className="text-left font-medium py-2 pr-3">Phone</th><th className="text-right font-medium py-2 pr-3">Assigned</th><th className="text-right font-medium py-2 pr-3">Completed</th><th className="text-right font-medium py-2 pr-3">Pending</th><th className="text-right font-medium py-2 pr-3">Delayed</th><th className="text-left font-medium py-2 pr-3">Active</th><th className="py-2"></th>
            </tr></thead>
            <tbody>
              {agents.map((a) => {
                const p = perfFor(a.id);
                return (
                  <tr key={a.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="py-2.5 pr-3 font-medium text-navy">{a.name}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{a.email}</td>
                    <td className="py-2.5 pr-3 tnum">{a.phone}</td>
                    <td className="py-2.5 pr-3 text-right tnum">{p?.totalAssigned ?? 0}</td>
                    <td className="py-2.5 pr-3 text-right tnum text-emerald-600 font-medium">{p?.completed ?? 0}</td>
                    <td className="py-2.5 pr-3 text-right tnum">{p?.pending ?? 0}</td>
                    <td className={`py-2.5 pr-3 text-right tnum ${(p?.delayed ?? 0) > 0 ? "text-destructive font-bold" : ""}`}>{p?.delayed ?? 0}</td>
                    <td className="py-2.5 pr-3"><Switch checked={a.isActive} onCheckedChange={() => handleToggle(a)} /></td>
                    <td className="py-2.5"><button onClick={() => setToDelete(a)} className="text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button></td>
                  </tr>
                );
              })}
              {agents.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No agents yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Agent</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone *</Label><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Password *</Label><Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">Create Agent</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete agent?</DialogTitle></DialogHeader>
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
