import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getBookings } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, CheckCircle, Clock, Eye, Inbox, AlertCircle } from "lucide-react";

type Tab = "new" | "mine" | "completed";

export default function StaffDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("new");

  // New jobs = pending/booked not yet assigned to anyone
  const newJobs = useMemo(() =>
    getBookings().filter(b => !b.assignedStaffId && !["completed", "cancelled", "rejected"].includes(b.status)),
    []
  );

  // My active jobs
  const myActive = useMemo(() =>
    getBookings({ staffId: user!.id }).filter(b => !["completed", "cancelled"].includes(b.status)),
    [user]
  );

  // My completed jobs
  const myCompleted = useMemo(() =>
    getBookings({ staffId: user!.id }).filter(b => b.status === "completed"),
    [user]
  );

  const displayList = tab === "new" ? newJobs : tab === "mine" ? myActive : myCompleted;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-0.5">Agent Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-7">Welcome, {user!.name}.</p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        {[
          { label: "New Requests", value: newJobs.length, icon: Inbox, color: "bg-amber-100 text-amber-600", alert: newJobs.length > 0 },
          { label: "My Active Jobs", value: myActive.length, icon: Clock, color: "bg-blue-100 text-blue-600", alert: false },
          { label: "Completed", value: myCompleted.length, icon: CheckCircle, color: "bg-green-100 text-green-600", alert: false },
        ].map((s, i) => (
          <Card key={i} className={s.alert ? "border-amber-200 shadow-sm" : ""}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color} relative`}>
                <s.icon size={20} />
                {s.alert && <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />}
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {([
          { key: "new", label: `New Requests${newJobs.length > 0 ? ` (${newJobs.length})` : ""}` },
          { key: "mine", label: `My Active (${myActive.length})` },
          { key: "completed", label: `Completed (${myCompleted.length})` },
        ] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Info for new jobs tab */}
      {tab === "new" && newJobs.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle size={15} className="text-amber-500 shrink-0" />
          These are customer requests not yet assigned. View them to start working.
        </div>
      )}

      {displayList.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground/30" size={40} />
            <p className="font-medium">
              {tab === "new" ? "No new requests right now." : tab === "mine" ? "No active jobs." : "No completed jobs yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayList.map(b => {
            const svc = getService(b.serviceId);
            const cust = getUser(b.userId);
            return (
              <Card key={b.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{svc?.name}</h3>
                      <StatusBadge status={b.status} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize ${b.type === "government" ? "bg-purple-100 text-purple-700" : "bg-orange-100 text-orange-700"}`}>
                        {b.type}
                      </span>
                      {!b.isPaid && b.status === "completed" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-100 text-red-600">Payment Pending</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Customer: <span className="font-medium text-gray-700">{cust?.name}</span> &bull; {cust?.phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Booked: {new Date(b.createdAt).toLocaleDateString("en-IN")}
                      {b.scheduledDate && ` &bull; Scheduled: ${new Date(b.scheduledDate).toLocaleDateString("en-IN")} ${b.scheduledTime}`}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link to={`/staff/jobs/${b.id}`}>
                      <Eye size={14} className="mr-1" /> View Job
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
