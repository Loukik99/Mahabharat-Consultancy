import { useEffect, useState } from "react";
import { listCallRequests, decideCallRequest, type CallRecord } from "@/api/calls.api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminNav } from "./AdminDashboard";
import { Check, X, Phone } from "lucide-react";

const FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "all", label: "All" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  denied: "bg-destructive/10 text-destructive",
  completed: "bg-navy/10 text-navy",
};

export default function AdminCalls() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (f = filter) => {
    setLoading(true);
    try {
      setCalls(await listCallRequests(f === "all" ? undefined : f));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filter); /* eslint-disable-next-line */ }, [filter]);

  const decide = async (id: string, action: "approve" | "deny") => {
    setBusy(id);
    try {
      await decideCallRequest(id, action);
      toast.success(action === "approve" ? "Call approved, agent & customer notified." : "Call request denied.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminNav active="Calls" />

      <div className="mb-6">
        <p className="eyebrow text-gold">Approvals</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Call Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve before an agent may call a customer. On approval, the customer is notified and the agent
          can dial. Agents cannot call without your approval.
        </p>
      </div>

      <div className="mb-5 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-border bg-card">
        {loading ? (
          <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-b-2 border-gold" /></div>
        ) : calls.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Phone className="mx-auto mb-2 text-muted-foreground/40" size={28} />
            No {filter === "pending" ? "pending " : ""}call requests.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium text-navy">{c.agentName ?? "—"}</td>
                  <td className="px-4 py-3 tnum text-muted-foreground">{c.requestNumber ?? "—"}</td>
                  <td className="px-4 py-3">{c.customerName ?? "—"}</td>
                  <td className="px-4 py-3 max-w-[18rem] truncate">{c.purpose}</td>
                  <td className="px-4 py-3 tnum text-muted-foreground">{new Date(c.at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[c.status] ?? "bg-secondary text-muted-foreground"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "pending" ? (
                      <div className="inline-flex gap-2">
                        <Button size="sm" className="h-8 bg-gold text-gold-foreground hover:bg-gold/90" disabled={busy === c.id} onClick={() => decide(c.id, "approve")}>
                          <Check size={14} className="mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy === c.id} onClick={() => decide(c.id, "deny")}>
                          <X size={14} className="mr-1" /> Deny
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
