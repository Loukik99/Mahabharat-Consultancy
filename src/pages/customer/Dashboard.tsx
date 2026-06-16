import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { serviceById } from "@/data/catalog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RequestStatus } from "@/types";
import { ClipboardList, Clock, IndianRupee, CheckCircle2, Eye, Plus, Wallet } from "lucide-react";

const FILTERS: { value: "all" | RequestStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "documents_required", label: "Documents Required" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_payment", label: "Waiting for Payment" },
  { value: "delivered", label: "Delivered" },
];

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");

  const all = useMemo(() => Req.listRequests({ userId: user!.id }), [user]);

  const visible = useMemo(
    () => (filter === "all" ? all : all.filter((r) => r.status === filter)),
    [all, filter],
  );

  const closed = ["completed", "delivered", "rejected", "cancelled"];
  const active = all.filter((r) => !closed.includes(r.status)).length;
  const awaitingPayment = all.filter((r) => r.status === "waiting_payment").length;
  const delivered = all.filter((r) => r.status === "delivered").length;

  const stats = [
    { label: "Total Requests", value: all.length, icon: ClipboardList, color: "bg-blue-100 text-blue-600" },
    { label: "Active", value: active, icon: Clock, color: "bg-orange-100 text-orange-600" },
    { label: "Awaiting Payment", value: awaitingPayment, icon: IndianRupee, color: "bg-yellow-100 text-yellow-600" },
    { label: "Delivered", value: delivered, icon: CheckCircle2, color: "bg-emerald-100 text-emerald-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {user!.name}</h1>
          <p className="text-sm text-muted-foreground">Track your service requests and documents</p>
        </div>
        <Button asChild className="mt-3 sm:mt-0 bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]">
          <Link to="/new-request"><Plus size={16} className="mr-1.5" /> New Request</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {stats.map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}><s.icon size={20} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1.5 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filter === f.value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground/40" size={40} />
            <p>No requests yet.</p>
            <Link to="/new-request" className="text-blue-600 hover:underline font-medium">Start a new request</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const svc = serviceById(r.serviceId);
            const awaiting = r.status === "waiting_payment";
            return (
              <Card key={r.id} className={awaiting ? "border-yellow-300" : ""}>
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold truncate">{svc?.name ?? "Service"}</h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.requestNumber}</span>
                      {" • "}{new Date(r.createdAt).toLocaleDateString("en-IN")}
                      {" • "}{r.priceLabel}
                    </p>
                    {awaiting && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-2 py-0.5">
                        <Wallet size={12} /> Payment due — pay now to unlock your files
                      </p>
                    )}
                  </div>
                  <Button asChild variant={awaiting ? "default" : "outline"} size="sm" className={awaiting ? "bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]" : ""}>
                    <Link to={`/requests/${r.id}`}>
                      {awaiting ? <><Wallet size={14} className="mr-1" /> Pay Now</> : <><Eye size={14} className="mr-1" /> View</>}
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
