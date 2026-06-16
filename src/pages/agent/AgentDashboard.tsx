import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import type { RequestStatus, ServiceRequest } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ClipboardList, Clock, FileWarning, Wallet, CheckCircle2,
  Eye, ShieldAlert, Inbox,
} from "lucide-react";

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

  const tasks = useMemo<ServiceRequest[]>(
    () => Req.listRequests({ agentId: user!.id }),
    [user]
  );

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
    { label: "Assigned", value: stats.assigned, icon: ClipboardList, color: "bg-emerald-100 text-emerald-600" },
    { label: "In Progress", value: stats.inProgress, icon: Clock, color: "bg-orange-100 text-orange-600" },
    { label: "Documents Required", value: stats.docsRequired, icon: FileWarning, color: "bg-amber-100 text-amber-600" },
    { label: "Waiting for Payment", value: stats.payment, icon: Wallet, color: "bg-yellow-100 text-yellow-700" },
    { label: "Completed / Delivered", value: stats.completed, icon: CheckCircle2, color: "bg-green-100 text-green-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-0.5">
        <h1 className="text-2xl font-bold tracking-tight">Agent Dashboard</h1>
        <span className="text-[11px] font-semibold bg-emerald-500 text-white px-2 py-0.5 rounded-full">Agent</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Welcome, {user!.name}. Here are the tasks assigned to you.</p>

      {/* OTP safety warning — always visible */}
      <Alert className="mb-6 border-amber-200 bg-amber-50">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Security reminder</AlertTitle>
        <AlertDescription className="text-amber-700">
          Never ask customers for banking OTPs, UPI PINs, or passwords. Only request the OTP needed for the
          specific government service.
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-7">
        {statCards.map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                <s.icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold">{s.value}</p>
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
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === c.key
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {c.label}{n > 0 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-3 text-muted-foreground/30" size={40} />
            <p className="font-medium">
              {tasks.length === 0 ? "No tasks assigned yet." : "No tasks match this filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const svc = getService(r.serviceId);
            const cust = getUser(r.userId);
            const firstName = cust?.name?.split(" ")[0] ?? "Customer";
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{svc?.name ?? "Service"}</h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.requestNumber}</span>
                      {" · "}Customer: <span className="font-medium text-gray-700">{firstName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link to={`/agent/tasks/${r.id}`}>
                      <Eye size={14} className="mr-1" /> Open Task
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
