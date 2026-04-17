import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getBookings } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Filter } from "lucide-react";

export default function ManageBookings() {
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");

  const bookings = useMemo(() => {
    const f: any = {};
    if (status !== "all") f.status = status;
    if (type !== "all") f.type = type;
    return getBookings(f);
  }, [status, type]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Bookings ({bookings.length})</h1>
          <Link to="/admin" className="text-blue-600 text-xs hover:underline">&larr; Dashboard</Link>
        </div>
      </div>

      <Card className="mb-5"><CardContent className="pt-4 pb-3 flex flex-wrap gap-3 items-center">
        <Filter size={16} className="text-muted-foreground" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["pending","verified","submitted","booked","assigned","in_progress","completed","rejected","cancelled"].map(s => <SelectItem key={s} value={s}>{s.replace("_"," ").toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="government">Government</SelectItem>
            <SelectItem value="home">Home</SelectItem>
          </SelectContent>
        </Select>
      </CardContent></Card>

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Service</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {bookings.map(b => {
              const svc = getService(b.serviceId);
              const usr = getUser(b.userId);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{usr?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{usr?.phone}</TableCell>
                  <TableCell>{svc?.name}</TableCell>
                  <TableCell className="capitalize">{b.type}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell>{"\u20B9"}{b.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell>{b.isPaid ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-red-500 text-xs font-medium">No</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell><Link to={`/admin/bookings/${b.id}`} className="text-blue-600 flex items-center gap-1 text-xs"><Eye size={14} /> View</Link></TableCell>
                </TableRow>
              );
            })}
            {bookings.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No bookings found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
