import { Link } from "react-router-dom";
import { getStats } from "@/api/stats.api";
import { getBookings } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Clock, CheckCircle, IndianRupee, Users, Settings, Eye } from "lucide-react";

export default function AdminDashboard() {
  const stats = getStats();
  const recent = getBookings({}).slice(0, 8);

  const cards = [
    { label: "Total Bookings", value: stats.totalBookings, icon: ClipboardList, color: "bg-blue-100 text-blue-600" },
    { label: "Pending", value: stats.pendingBookings, icon: Clock, color: "bg-yellow-100 text-yellow-600" },
    { label: "Completed", value: stats.completedBookings, icon: CheckCircle, color: "bg-green-100 text-green-600" },
    { label: "Revenue", value: `\u20B9${stats.totalRevenue.toLocaleString("en-IN")}`, icon: IndianRupee, color: "bg-emerald-100 text-emerald-600" },
    { label: "Customers", value: stats.totalCustomers, icon: Users, color: "bg-purple-100 text-purple-600" },
    { label: "Services", value: stats.totalServices, icon: Settings, color: "bg-pink-100 text-pink-600" },
  ];

  const quickLinks = [
    { to: "/admin/bookings", icon: ClipboardList, label: "Manage Bookings" },
    { to: "/admin/services", icon: Settings, label: "Manage Services" },
    { to: "/admin/payments", icon: IndianRupee, label: "View Payments" },
    { to: "/admin/staff", icon: Users, label: "Manage Staff" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Admin Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-7">Manage bookings, services, and staff</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-7">
        {cards.map((s, i) => (
          <Card key={i}><CardContent className="pt-4 pb-3 text-center">
            <div className={`w-9 h-9 ${s.color} rounded-lg flex items-center justify-center mx-auto mb-1.5`}><s.icon size={18} /></div>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        {quickLinks.map(l => (
          <Link key={l.to} to={l.to}>
            <Card className="hover:shadow-md transition-shadow"><CardContent className="pt-4 pb-3 text-center">
              <l.icon className="mx-auto text-blue-600 mb-1.5" size={24} />
              <p className="font-semibold text-sm">{l.label}</p>
            </CardContent></Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Bookings</h2>
            <Link to="/admin/bookings" className="text-blue-600 text-xs font-medium hover:underline">View All</Link>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Customer</TableHead><TableHead>Service</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {recent.map(b => {
                const svc = getService(b.serviceId);
                const usr = getUser(b.userId);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{usr?.name}</TableCell>
                    <TableCell>{svc?.name}</TableCell>
                    <TableCell className="capitalize">{b.type}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell><Link to={`/admin/bookings/${b.id}`} className="text-blue-600"><Eye size={15} /></Link></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
