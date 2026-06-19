import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { StatusBadge } from "@/components/StatusBadge";
import DeleteAccountCard from "@/components/DeleteAccountCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { RequestStatus, ServiceRequest } from "@/types";
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
  const [all, setAll] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const requests = await Req.listRequests();
        if (active) setAll(requests);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? all : all.filter((r) => r.status === filter)),
    [all, filter],
  );

  const closed = ["completed", "delivered", "rejected", "cancelled"];
  const active = all.filter((r) => !closed.includes(r.status)).length;
  const awaitingPayment = all.filter((r) => r.status === "waiting_payment").length;
  const delivered = all.filter((r) => r.status === "delivered").length;

  const stats = [
    { label: "Total Requests", value: all.length, icon: ClipboardList },
    { label: "Active", value: active, icon: Clock },
    { label: "Awaiting Payment", value: awaitingPayment, icon: IndianRupee },
    { label: "Delivered", value: delivered, icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <p className="eyebrow text-gold">Your account</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">Welcome, {user!.name}</h1>
          <p className="text-sm text-muted-foreground">Track your service requests and documents</p>
        </div>
        <Button asChild className="mt-3 sm:mt-0 bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
          <Link to="/new-request"><Plus size={16} className="mr-1.5" /> New Request</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {stats.map((s, i) => (
          <Card key={i} className="rounded border border-border">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-navy text-gold"><s.icon size={20} /></div>
              <div><p className="font-display text-2xl font-semibold text-navy tnum">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1.5 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === f.value ? "bg-navy text-white" : "bg-secondary text-muted-foreground hover:text-navy"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="rounded border border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground/40" size={40} />
            <p>No requests yet.</p>
            <Link to="/new-request" className="font-medium text-gold hover:underline">Start a new request</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const awaiting = r.status === "waiting_payment";
            return (
              <Card key={r.id} className={`rounded border transition-colors hover:border-gold ${awaiting ? "border-amber-300" : "border-border"}`}>
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-display text-lg font-semibold text-navy truncate">{r.serviceName}</h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono tnum">{r.requestNumber}</span>
                      {" • "}{new Date(r.createdAt).toLocaleDateString("en-IN")}
                      {" • "}{r.priceLabel}
                    </p>
                    {awaiting && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                        <Wallet size={12} /> Payment due — pay now to unlock your files
                      </p>
                    )}
                  </div>
                  <Button asChild variant={awaiting ? "default" : "outline"} size="sm" className={awaiting ? "bg-gold font-semibold text-gold-foreground hover:bg-gold/90" : "border-navy/20 text-navy hover:text-navy"}>
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

      <div className="mt-10 max-w-2xl">
        <DeleteAccountCard role="customer" />
      </div>
    </div>
  );
}
