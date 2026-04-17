import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBooking, markPaid } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { createPayment } from "@/api/payments.api";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  IndianRupee, User, Calendar, MapPin, FileDown,
  QrCode, Copy, CheckCircle2, Clock, ExternalLink,
} from "lucide-react";

const UPI_ID = "mahabharat@upi"; // TODO: Replace with real UPI ID
const UPI_NAME = "Mahabharat Consultancy";

function UpiPaymentPanel({ amount, bookingId, onPaid }: { amount: number; bookingId: string; onPaid: () => void }) {
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();

  const note = encodeURIComponent(`Service Payment - Booking ${bookingId}`);
  const upiDeepLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR&tn=${note}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiDeepLink)}&bgcolor=ffffff&color=1a1a2e&margin=2`;

  const handleCopy = () => {
    navigator.clipboard.writeText(UPI_ID).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConfirmPaid = () => {
    createPayment({ bookingId, userId: user!.id, amount, method: "upi", status: "completed" });
    markPaid(bookingId);
    toast.success("Payment confirmed! Thank you.");
    onPaid();
  };

  return (
    <div className="mt-6 pt-5 border-t">
      <div className="flex items-center gap-2 mb-4">
        <QrCode size={18} className="text-indigo-600" />
        <h3 className="font-bold text-gray-900 text-base">Pay Now</h3>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Service Completed</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-md">
            <img
              src={qrUrl}
              alt="UPI QR Code"
              className="w-[180px] h-[180px] rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">Scan with any UPI app<br/>(GPay, PhonePe, Paytm, BHIM)</p>
        </div>

        {/* Payment Info */}
        <div className="space-y-3">
          <div className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100">
            <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide mb-0.5">Amount to Pay</p>
            <p className="text-3xl font-bold text-indigo-700 flex items-center gap-1">
              <IndianRupee size={20} />₹{amount.toLocaleString("en-IN")}
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">UPI ID</p>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono font-semibold text-gray-900 text-sm">{UPI_ID}</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {copied ? <CheckCircle2 size={13} className="text-green-500" /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{UPI_NAME}</p>
          </div>

          {/* Open UPI App Button */}
          <a
            href={upiDeepLink}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff] text-white py-2.5 rounded-xl text-sm font-semibold shadow-md hover:opacity-90 transition-opacity"
          >
            <ExternalLink size={14} />
            Open UPI App to Pay
          </a>

          <Button
            variant="outline"
            className="w-full border-green-200 text-green-700 hover:bg-green-50"
            onClick={handleConfirmPaid}
          >
            <CheckCircle2 size={14} className="mr-1.5" />
            I've Completed the Payment
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [, rerender] = useState(0);

  const booking = getBooking(id!);
  const service = booking ? getService(booking.serviceId) : null;
  const staff = booking?.assignedStaffId ? getUser(booking.assignedStaffId) : null;

  if (!booking || !service) return <p className="text-center py-20 text-muted-foreground">Booking not found</p>;

  const isCompleted = booking.status === "completed";
  const awaitingPayment = isCompleted && !booking.isPaid;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm font-medium hover:underline mb-4 inline-block">← Back</button>

      {/* Payment due banner */}
      {awaitingPayment && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-sm">
          <QrCode size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Payment Required</p>
            <p className="text-xs text-amber-600">Your service is complete! Please pay ₹{booking.amount.toLocaleString("en-IN")} to close this booking.</p>
          </div>
        </div>
      )}

      {/* In progress banner */}
      {!isCompleted && !booking.isPaid && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3 text-sm">
          <Clock size={16} className="text-blue-500 shrink-0" />
          <p className="text-blue-700">Payment of <strong>₹{booking.amount.toLocaleString("en-IN")}</strong> will be collected after your service is completed.</p>
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold">{service.name}</h1>
              <p className="text-sm text-muted-foreground capitalize">{booking.type} Service</p>
            </div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <StatusBadge status={booking.status} />
              {booking.isPaid
                ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">Paid</span>
                : <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">Unpaid</span>
              }
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold border-b pb-1.5">Booking Details</h3>
              <p><span className="text-muted-foreground">ID:</span> <span className="font-mono text-xs">{booking.id}</span></p>
              <p><span className="text-muted-foreground">Created:</span> {new Date(booking.createdAt).toLocaleString("en-IN")}</p>
              <p className="flex items-center gap-1">
                <IndianRupee size={14} className="text-green-600" />
                <span className="font-bold">₹{booking.amount.toLocaleString("en-IN")}</span>
              </p>
              {staff && (
                <p className="flex items-center gap-1">
                  <User size={14} className="text-muted-foreground" />
                  Agent: {staff.name} ({staff.phone})
                </p>
              )}
              {booking.adminNotes && (
                <div className="p-2.5 bg-blue-50 rounded text-xs"><span className="font-medium">Note:</span> {booking.adminNotes}</div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {booking.type === "government" && booking.applicantDetails && (
                <>
                  <h3 className="font-semibold border-b pb-1.5">Applicant Details</h3>
                  {booking.applicantDetails.fullName && <p><span className="text-muted-foreground">Name:</span> {booking.applicantDetails.fullName}</p>}
                  {booking.applicantDetails.fatherName && <p><span className="text-muted-foreground">Father:</span> {booking.applicantDetails.fatherName}</p>}
                  {booking.applicantDetails.dob && <p><span className="text-muted-foreground">DOB:</span> {new Date(booking.applicantDetails.dob).toLocaleDateString("en-IN")}</p>}
                </>
              )}
              {booking.type === "home" && (
                <>
                  <h3 className="font-semibold border-b pb-1.5">Schedule & Address</h3>
                  {booking.scheduledDate && (
                    <p className="flex items-center gap-1"><Calendar size={14} className="text-muted-foreground" /> {new Date(booking.scheduledDate).toLocaleDateString("en-IN")} {booking.scheduledTime}</p>
                  )}
                  {booking.address && (
                    <p className="flex items-start gap-1"><MapPin size={14} className="text-muted-foreground mt-0.5" /> {[booking.address.street, booking.address.city, booking.address.state, booking.address.pincode].filter(Boolean).join(", ")}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {booking.documents.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold text-sm border-b pb-1.5 mb-2">Documents</h3>
              {booking.documents.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-muted p-2 rounded mb-1 text-xs">
                  <span>{d.name}</span>
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      <FileDown size={12} /> View
                    </a>
                  ) : (
                    <span className="text-gray-400">No file</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* UPI Payment Panel — only when completed & unpaid */}
          {awaitingPayment && (
            <UpiPaymentPanel
              amount={booking.amount}
              bookingId={booking.id}
              onPaid={() => rerender(n => n + 1)}
            />
          )}

          {/* Already paid confirmation */}
          {isCompleted && booking.isPaid && (
            <div className="mt-5 pt-4 border-t flex items-center gap-3 text-green-700">
              <CheckCircle2 size={20} className="text-green-500" />
              <div>
                <p className="font-semibold text-sm">Payment Received</p>
                <p className="text-xs text-muted-foreground">Thank you! Your booking is complete.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
