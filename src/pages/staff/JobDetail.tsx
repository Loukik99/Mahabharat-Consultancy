import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { BookingStatus } from "@/types";
import { getBooking, updateBookingStatus, addStaffProof } from "@/api/bookings.api";
import { getService } from "@/api/services.api";
import { getUser } from "@/api/users.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Phone, Calendar, MapPin, Upload, ExternalLink, User,
  FileText, CheckCircle2, ArrowRight, IndianRupee, AlertCircle,
} from "lucide-react";

const OFFICIAL_LABELS: Record<string, string> = {
  "https://uidai.gov.in/en/my-aadhaar/get-aadhaar.html": "UIDAI — Aadhar Portal",
  "https://www.onlineservices.nsdl.com/": "NSDL — PAN Card Portal",
  "https://passportindia.gov.in/": "Passport Seva Portal",
  "https://sarathi.parivahan.gov.in/": "Sarathi — Driving License Portal",
  "https://aaplesarkar.mahaonline.gov.in/": "Aaple Sarkar — MahaOnline",
  "https://sellercentral.amazon.in/": "Amazon Seller Central",
  "https://seller.flipkart.com/": "Flipkart Seller Hub",
  "https://www.gst.gov.in/home": "GST Portal",
};

const STATUS_FLOW: Record<string, BookingStatus[]> = {
  government: ["pending", "verified", "submitted", "completed"],
  home: ["booked", "assigned", "in_progress", "completed"],
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  verified: "Documents Verified",
  submitted: "Submitted to Govt",
  completed: "Completed",
  booked: "Booked",
  assigned: "Assigned",
  in_progress: "In Progress",
};

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [, rerender] = useState(0);
  const [proofName, setProofName] = useState("");

  const booking = getBooking(id!);
  const service = booking ? getService(booking.serviceId) : null;
  const customer = booking ? getUser(booking.userId) : null;

  if (!booking || !service) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <AlertCircle size={40} className="mb-3 text-red-400" />
      <p>Job not found</p>
    </div>
  );

  const flow = STATUS_FLOW[booking.type] ?? STATUS_FLOW.home;
  const currentIdx = flow.indexOf(booking.status as BookingStatus);
  const nextStatus = currentIdx >= 0 && currentIdx < flow.length - 1 ? flow[currentIdx + 1] : null;
  const isCompleted = booking.status === "completed";

  const handleAdvance = () => {
    if (!nextStatus) return;
    updateBookingStatus(booking.id, nextStatus);
    toast.success(`Status updated to: ${STATUS_LABELS[nextStatus] ?? nextStatus}`);
    rerender(n => n + 1);
  };

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      addStaffProof(booking.id, file.name, reader.result as string);
      setProofName(file.name);
      toast.success("Proof uploaded successfully");
      rerender(n => n + 1);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate("/staff")} className="text-blue-600 text-sm font-medium hover:underline mb-5 inline-flex items-center gap-1">
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{service.name}</h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{booking.type} Service &bull; Booking #{booking.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          {booking.isPaid
            ? <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Paid</span>
            : <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Payment Pending</span>
          }
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1 mb-7 overflow-x-auto pb-1">
        {flow.map((step, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <div key={step} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                active ? "bg-blue-600 text-white shadow-md shadow-blue-200" :
                done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
              }`}>
                {done && !active ? <CheckCircle2 size={12} /> : <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px]">{i + 1}</span>}
                {STATUS_LABELS[step] ?? step}
              </div>
              {i < flow.length - 1 && <ArrowRight size={14} className="text-gray-300 shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — main info */}
        <div className="lg:col-span-2 space-y-5">

          {/* Customer Card */}
          <Card className="border-blue-100">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2"><User size={15} className="text-blue-500" /> Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{customer?.name}</p>
                  <p className="text-xs text-muted-foreground">{customer?.email}</p>
                </div>
                {/* Call button — like Uber/Zomato */}
                <a
                  href={`tel:+91${customer?.phone}`}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-green-200 transition-all active:scale-95"
                >
                  <Phone size={15} />
                  Call Customer
                </a>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg text-xs font-mono text-gray-600">
                +91 {customer?.phone}
              </div>
              {booking.notes && (
                <div className="p-2.5 bg-amber-50 rounded-lg text-xs border border-amber-100">
                  <span className="font-semibold text-amber-800">Customer Note:</span> {booking.notes}
                </div>
              )}
              {booking.adminNotes && (
                <div className="p-2.5 bg-blue-50 rounded-lg text-xs border border-blue-100">
                  <span className="font-semibold text-blue-800">Admin Note:</span> {booking.adminNotes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Govt — Applicant Details */}
          {booking.type === "government" && booking.applicantDetails && (
            <Card className="border-purple-100">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2"><FileText size={15} className="text-purple-500" /> Applicant Details</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {booking.applicantDetails.fullName && (
                    <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Full Name</p><p className="font-medium">{booking.applicantDetails.fullName}</p></div>
                  )}
                  {booking.applicantDetails.fatherName && (
                    <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Father's Name</p><p className="font-medium">{booking.applicantDetails.fatherName}</p></div>
                  )}
                  {booking.applicantDetails.dob && (
                    <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Date of Birth</p><p className="font-medium">{new Date(booking.applicantDetails.dob).toLocaleDateString("en-IN")}</p></div>
                  )}
                  {booking.applicantDetails.aadharNumber && (
                    <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Aadhar No.</p><p className="font-mono font-medium">{booking.applicantDetails.aadharNumber}</p></div>
                  )}
                  {booking.applicantDetails.additionalInfo && (
                    <div className="col-span-2"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Additional Info</p><p className="font-medium">{booking.applicantDetails.additionalInfo}</p></div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Home — Schedule & Address */}
          {booking.type === "home" && (
            <Card className="border-orange-100">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2"><Calendar size={15} className="text-orange-500" /> Schedule & Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm pb-4">
                {booking.scheduledDate && (
                  <div className="flex items-center gap-2 p-2.5 bg-orange-50 rounded-lg">
                    <Calendar size={14} className="text-orange-500 shrink-0" />
                    <span className="font-medium">{new Date(booking.scheduledDate).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} &bull; {booking.scheduledTime}</span>
                  </div>
                )}
                {booking.address && (
                  <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                    <MapPin size={14} className="text-gray-500 shrink-0 mt-0.5" />
                    <span>{[booking.address.street, booking.address.landmark, booking.address.city, booking.address.state, booking.address.pincode].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents uploaded by customer */}
          {booking.documents.length > 0 && (
            <Card className="border-indigo-100">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2"><FileText size={15} className="text-indigo-500" /> Customer Documents</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-1.5">
                  {booking.documents.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-indigo-50 px-3 py-2 rounded-lg text-xs">
                      <span className="font-medium text-indigo-800">{d.name}</span>
                      {d.url ? (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1"
                        >
                          <ExternalLink size={11} /> View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-[10px]">No file</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Staff proof already uploaded */}
          {booking.staffProof.length > 0 && (
            <Card className="border-green-100">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 size={15} className="text-green-500" /> Uploaded Proof</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-1.5">
                  {booking.staffProof.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-lg text-xs">
                      <span className="font-medium text-green-800">{d.name}</span>
                      {d.url ? (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 font-semibold hover:text-green-800 flex items-center gap-1"
                        >
                          <ExternalLink size={11} /> View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-[10px]">No file</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — Actions */}
        <div className="space-y-5">

          {/* Official Portal Link */}
          {service.officialUrl && (
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Official Portal</p>
                <p className="text-xs text-blue-600 mb-3">{OFFICIAL_LABELS[service.officialUrl] ?? "Government Portal"}</p>
                <a
                  href={service.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-200"
                >
                  <ExternalLink size={14} />
                  Open Portal
                </a>
                <p className="text-[10px] text-blue-400 mt-2 text-center">Opens official government website in a new tab</p>
              </CardContent>
            </Card>
          )}

          {/* Amount */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Service Amount</p>
              <p className="text-2xl font-bold text-gray-900 flex items-center gap-1"><IndianRupee size={18} />₹{booking.amount.toLocaleString("en-IN")}</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {booking.isPaid
                  ? "✅ Customer has paid"
                  : "⏳ Payment collected after completion"}
              </p>
            </CardContent>
          </Card>

          {/* Advance Status */}
          {!isCompleted && nextStatus && (
            <Card className="border-green-200">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Next Step</p>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 shadow-md shadow-green-200 font-semibold"
                  onClick={handleAdvance}
                >
                  <ArrowRight size={15} className="mr-1.5" />
                  Mark as: {STATUS_LABELS[nextStatus] ?? nextStatus}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Mark Complete — shown when one step before completed */}
          {isCompleted && (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="pt-4 pb-4 text-center">
                <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                <p className="font-bold text-green-800">Task Completed!</p>
                <p className="text-xs text-green-600 mt-1">Customer will now be prompted to make payment.</p>
              </CardContent>
            </Card>
          )}

          {/* Upload Proof */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Upload Completion Proof</p>
              <label
                htmlFor="proofFile"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all text-center"
              >
                <Upload size={20} className="text-gray-400" />
                <span className="text-xs text-gray-500">Click to upload screenshot / photo</span>
                <input
                  id="proofFile"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                  onChange={handleProofUpload}
                />
              </label>
              {proofName && (
                <p className="text-xs text-green-600 font-medium mt-2 text-center">✓ {proofName}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
