import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { BookingStatus } from "@/types";
import { getBooking, updateBookingStatus, assignStaff, markPaid } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser, getStaff } from "@/api/users.api";
import { createPayment } from "@/api/payments.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { IndianRupee, User, Calendar, MapPin, FileDown } from "lucide-react";

const govStatuses: BookingStatus[] = ["pending", "verified", "submitted", "completed", "rejected"];
const homeStatuses: BookingStatus[] = ["booked", "assigned", "in_progress", "completed", "cancelled"];

export default function AdminBookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [, rerender] = useState(0);

  const booking = getBooking(id!);
  const service = booking ? getService(booking.serviceId) : null;
  const customer = booking ? getUser(booking.userId) : null;
  const assignedStaff = booking?.assignedStaffId ? getUser(booking.assignedStaffId) : null;
  const allStaff = getStaff();

  const [newStatus, setNewStatus] = useState(booking?.status || "pending");
  const [adminNotes, setAdminNotes] = useState(booking?.adminNotes || "");
  const [staffId, setStaffId] = useState(booking?.assignedStaffId || "");

  if (!booking || !service) return <p className="text-center py-20 text-muted-foreground">Booking not found</p>;

  const statuses = booking.type === "government" ? govStatuses : homeStatuses;

  const handleStatusUpdate = () => {
    updateBookingStatus(booking.id, newStatus as BookingStatus, adminNotes);
    toast.success("Status updated");
    rerender(n => n + 1);
  };

  const handleAssign = () => {
    if (!staffId) return toast.error("Select a staff member");
    assignStaff(booking.id, staffId);
    toast.success("Staff assigned");
    rerender(n => n + 1);
  };

  const handleCashPayment = () => {
    createPayment({ bookingId: booking.id, userId: booking.userId, amount: booking.amount, method: "cash", status: "completed" });
    markPaid(booking.id);
    toast.success("Cash payment recorded");
    rerender(n => n + 1);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate("/admin/bookings")} className="text-blue-600 text-sm font-medium hover:underline mb-4 inline-block">&larr; Back to Bookings</button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card><CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <div><h1 className="text-lg font-bold">{service.name}</h1><p className="text-xs text-muted-foreground capitalize">{booking.type} Service</p></div>
              <StatusBadge status={booking.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{customer?.name}</span></p>
              <p><span className="text-muted-foreground">Phone:</span> {customer?.phone}</p>
              <p><span className="text-muted-foreground">Email:</span> {customer?.email}</p>
              <p><span className="text-muted-foreground">Created:</span> {new Date(booking.createdAt).toLocaleString("en-IN")}</p>
              <p className="flex items-center gap-1"><IndianRupee size={14} className="text-green-600" /><span className="font-bold">{"\u20B9"}{booking.amount.toLocaleString("en-IN")}</span>
                {booking.isPaid ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold ml-1">Paid</span> : <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold ml-1">Unpaid</span>}
              </p>
              {assignedStaff && <p className="flex items-center gap-1"><User size={14} className="text-muted-foreground" /> {assignedStaff.name}</p>}
            </div>

            {booking.type === "government" && booking.applicantDetails && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                <h3 className="font-semibold text-xs mb-1">Applicant Details</h3>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {booking.applicantDetails.fullName && <p><span className="text-muted-foreground">Name:</span> {booking.applicantDetails.fullName}</p>}
                  {booking.applicantDetails.fatherName && <p><span className="text-muted-foreground">Father:</span> {booking.applicantDetails.fatherName}</p>}
                  {booking.applicantDetails.dob && <p><span className="text-muted-foreground">DOB:</span> {new Date(booking.applicantDetails.dob).toLocaleDateString("en-IN")}</p>}
                  {booking.applicantDetails.aadharNumber && <p><span className="text-muted-foreground">Aadhar:</span> {booking.applicantDetails.aadharNumber}</p>}
                </div>
              </div>
            )}
            {booking.type === "home" && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg text-xs">
                {booking.scheduledDate && <p className="flex items-center gap-1"><Calendar size={12} className="text-muted-foreground" /> {new Date(booking.scheduledDate).toLocaleDateString("en-IN")} {booking.scheduledTime}</p>}
                {booking.address && <p className="flex items-center gap-1 mt-1"><MapPin size={12} className="text-muted-foreground" /> {[booking.address.street, booking.address.city, booking.address.state, booking.address.pincode].filter(Boolean).join(", ")}</p>}
              </div>
            )}
            {booking.notes && <div className="mt-3 p-2.5 bg-muted rounded text-xs"><span className="font-medium">Notes:</span> {booking.notes}</div>}
          </CardContent></Card>

          {booking.documents.length > 0 && (
            <Card><CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-2">Documents ({booking.documents.length})</h3>
              {booking.documents.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-muted p-2 rounded mb-1 text-xs">
                  <span>{d.name}</span>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold">
                      <FileDown size={12} /> View
                    </a>
                  ) : (
                    <span className="text-gray-400">No file</span>
                  )}
                </div>
              ))}
            </CardContent></Card>
          )}
        </div>

        <div className="space-y-5">
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3">Update Status</h3>
            <Select value={newStatus} onValueChange={v => setNewStatus(v as BookingStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{statuses.map(s => <SelectItem key={s} value={s}>{s.replace("_"," ").toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <div className="mt-3"><Label className="text-xs">Admin Notes</Label><Textarea rows={2} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="mt-1" /></div>
            <Button className="w-full mt-3" size="sm" onClick={handleStatusUpdate}>Update Status</Button>
          </CardContent></Card>

          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3">Assign Staff</h3>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>{allStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.phone})</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full mt-3" size="sm" onClick={handleAssign}>Assign</Button>
          </CardContent></Card>

          {!booking.isPaid && (
            <Card><CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-2">Record Payment</h3>
              <p className="text-xs text-muted-foreground mb-3">Amount: {"\u20B9"}{booking.amount.toLocaleString("en-IN")}</p>
              <Button className="w-full bg-green-600 hover:bg-green-700" size="sm" onClick={handleCashPayment}>Record Cash Payment</Button>
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}
