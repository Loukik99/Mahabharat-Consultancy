import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import type { RequestStatus, ServiceRequest } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import DeleteAccountCard from "@/components/DeleteAccountCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ClipboardList, Clock, FileWarning, Wallet, CheckCircle2,
  Eye, ShieldAlert, Inbox,
} from "lucide-react";

// The agent-scoped API enriches each request with display fields that are
// not part of the base persisted model.
type AgentRequest = ServiceRequest & {
  serviceName: string;
  customerName: string;
  assignedAgentName?: string;
};

type FilterKey = "all" | RequestStatus;

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_review", label: "In Review" },
  { key: "in_progress", label: "In Progress" },
  { key: "documents_required", label: "Documents Required" },
  { key: "waiting_otp", label: "Waiting for OTP" },
  { key: "waiting_payment", label: "Waiting for Payment" },
  { key: "completed", label: "Completed" },
  { key: "delivered", label: "Delivered" },
];

export default function AgentDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [tasks, setTasks] = useState<AgentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const data = (await Req.listRequests()) as AgentRequest[];
        if (active) setTasks(data);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const count = (fn: (r: ServiceRequest) => boolean) => tasks.filter(fn).length;
    return {
      assigned: tasks.length,
      inProgress: count((r) => r.status === "in_progress"),
      docsRequired: count((r) => r.status === "documents_required"),
      payment: count((r) => r.status === "waiting_payment"),
      completed: count((r) => r.status === "completed" || r.status === "delivered"),
    };
  }, [tasks]);

  const visible = filter === "all" ? tasks : tasks.filter((r) => r.status === filter);

  const statCards = [
    { label: "Assigned", value: stats.assigned, icon: ClipboardList },
    { label: "In Progress", value: stats.inProgress, icon: Clock },
    { label: "Documents Required", value: stats.docsRequired, icon: FileWarning },
    { label: "Waiting for Payment", value: stats.payment, icon: Wallet },
    { label: "Completed / Delivered", value: stats.completed, icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-0.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Agent Dashboard</h1>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-navy text-white px-2 py-0.5 rounded">Agent</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Welcome, {user!.name}. Here are the tasks assigned to you.</p>

      {/* OTP safety warning — always visible */}
      <Alert className="mb-6 rounded border-l-2 border-l-destructive border-y border-r border-destructive/30 bg-destructive/5">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <AlertTitle className="text-navy">Security reminder</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Never ask customers for banking OTPs, UPI PINs, or passwords. Only request the OTP needed for the
          specific government service.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-7">
            {statCards.map((s, i) => (
              <Card key={i} className="rounded border border-border">
                <CardContent className="pt-4 pb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-navy text-gold">
                    <s.icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-semibold text-navy tnum">{s.value}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 mb-5 flex-wrap">
            {FILTER_CHIPS.map((c) => {
              const n = c.key === "all" ? tasks.length : tasks.filter((r) => r.status === c.key).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    filter === c.key
                      ? "bg-navy text-white"
                      : "bg-secondary text-muted-foreground hover:text-navy"
                  }`}
                >
                  {c.label}{n > 0 ? ` (${n})` : ""}
                </button>
              );
            })}
          </div>

          {/* Task list */}
          {visible.length === 0 ? (
            <Card className="rounded border border-border">
              <CardContent className="py-14 text-center text-muted-foreground">
                <Inbox className="mx-auto mb-3 text-muted-foreground/30" size={40} />
                <p className="font-medium">
                  {tasks.length === 0 ? "No tasks assigned yet." : "No tasks match this filter."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {visible.map((r) => (
                <Card key={r.id} className="rounded border border-border transition-colors hover:border-gold">
                  <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="font-display text-lg font-semibold text-navy">{r.serviceName}</h3>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono tnum">{r.requestNumber}</span>
                        {" · "}Customer: <span className="font-medium text-foreground">{r.customerName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(r.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0 border-navy/20 text-navy hover:text-navy">
                      <Link to={`/agent/tasks/${r.id}`}>
                        <Eye size={14} className="mr-1" /> Open Task
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-10 max-w-2xl">
        <DeleteAccountCard role="agent" />
      </div>
    </div>
  );
}
