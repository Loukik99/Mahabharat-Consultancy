import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getBookings } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Calendar, IndianRupee, Eye } from "lucide-react";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("");

  const bookings = useMemo(() => {
    const f: any = { userId: user!.id };
    if (filter) f.status = filter;
    return getBookings(f);
  }, [user, filter]);

  const total = getBookings({ userId: user!.id });
  const active = total.filter(b => !["completed", "rejected", "cancelled"].includes(b.status)).length;
  const completed = total.filter(b => b.status === "completed").length;

  const stats = [
    { label: "Total Bookings", value: total.length, icon: ClipboardList, color: "bg-blue-100 text-blue-600" },
    { label: "Active", value: active, icon: Calendar, color: "bg-orange-100 text-orange-600" },
    { label: "Completed", value: completed, icon: IndianRupee, color: "bg-green-100 text-green-600" },
  ];

  const filters = ["", "pending", "booked", "assigned", "in_progress", "completed"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {user!.name}</h1>
          <p className="text-sm text-muted-foreground">Track your bookings and services</p>
        </div>
        <Button asChild className="mt-3 sm:mt-0"><Link to="/services">New Booking</Link></Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        {stats.map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon size={20} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1.5 mb-5 flex-wrap">
        {filters.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-md text-xs font-medium ${filter === s ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
            {s ? s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) : "All"}
          </button>
        ))}
      </div>

      {bookings.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardList className="mx-auto mb-3 text-muted-foreground/40" size={40} />
          No bookings found. <Link to="/services" className="text-blue-600 hover:underline ml-1">Browse Services</Link>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => {
            const svc = getService(b.serviceId);
            return (
              <Card key={b.id}>
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold">{svc?.name}</h3>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.type === "government" ? "Application" : "Booking"} &bull; {new Date(b.createdAt).toLocaleDateString("en-IN")}
                      {b.scheduledDate && ` \u2022 Scheduled: ${new Date(b.scheduledDate).toLocaleDateString("en-IN")}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Amount: <span className="font-medium text-foreground">{"\u20B9"}{b.amount.toLocaleString("en-IN")}</span>
                      {b.isPaid ? <span className="text-green-600 ml-1">(Paid)</span> : <span className="text-red-500 ml-1">(Unpaid)</span>}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm"><Link to={`/bookings/${b.id}`}><Eye size={14} className="mr-1" /> View</Link></Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
