import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getService } from "@/api/services.api";
import { createBooking, addDocument } from "@/api/bookings.api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { IndianRupee, Upload, Info } from "lucide-react";

export default function BookingFormPage() {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const service = getService(serviceId!);

  const [applicant, setApplicant] = useState({ fullName: user?.name || "", fatherName: "", dob: "", aadharNumber: "", additionalInfo: "" });
  const [schedule, setSchedule] = useState({ scheduledDate: "", scheduledTime: "", street: user?.address?.street || "", city: user?.address?.city || "", state: user?.address?.state || "", pincode: user?.address?.pincode || "", landmark: "" });
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);

  if (!service) return <p className="text-center py-20 text-muted-foreground">Service not found</p>;
  const isGov = service.category === "government";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => [...prev, { name: file.name, url: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const booking = createBooking({
      userId: user!.id,
      serviceId: service.id,
      type: isGov ? "government" : "home",
      status: isGov ? "pending" : "booked",
      amount: service.price,
      notes,
      ...(isGov ? { applicantDetails: applicant } : {
        scheduledDate: schedule.scheduledDate,
        scheduledTime: schedule.scheduledTime,
        address: { street: schedule.street, city: schedule.city, state: schedule.state, pincode: schedule.pincode, landmark: schedule.landmark },
      }),
    });

    files.forEach(f => addDocument(booking.id, f.name, f.url));

    toast.success("Booking submitted! Our agent will contact you shortly.");
    navigate("/dashboard");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{isGov ? "Apply for" : "Book"} {service.name}</CardTitle>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">{service.category} Service</p>
            </div>
            <span className="flex items-center text-lg font-bold"><IndianRupee size={16} className="text-green-600" />{service.price.toLocaleString("en-IN")}</span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {isGov ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Full Name *</Label><Input required value={applicant.fullName} onChange={e => setApplicant({ ...applicant, fullName: e.target.value })} /></div>
                  <div><Label>Father's Name</Label><Input value={applicant.fatherName} onChange={e => setApplicant({ ...applicant, fatherName: e.target.value })} /></div>
                  <div><Label>Date of Birth</Label><Input type="date" value={applicant.dob} onChange={e => setApplicant({ ...applicant, dob: e.target.value })} /></div>
                  <div><Label>Aadhar Number</Label><Input maxLength={12} placeholder="12-digit" value={applicant.aadharNumber} onChange={e => setApplicant({ ...applicant, aadharNumber: e.target.value })} /></div>
                </div>
                <div><Label>Additional Info</Label><Textarea rows={2} value={applicant.additionalInfo} onChange={e => setApplicant({ ...applicant, additionalInfo: e.target.value })} /></div>

                {service.requiredDocuments.length > 0 && (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm">
                    <p className="font-semibold text-xs mb-1">Required Documents:</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs">{service.requiredDocuments.map((d, i) => <li key={i}>{d}</li>)}</ul>
                  </div>
                )}
                <div>
                  <Label>Upload Documents</Label>
                  <div className="border-2 border-dashed rounded-lg p-5 text-center mt-1">
                    <Upload className="mx-auto text-muted-foreground mb-1" size={24} />
                    <input type="file" multiple onChange={handleFileChange} className="hidden" id="fileUp" />
                    <label htmlFor="fileUp" className="cursor-pointer text-blue-600 text-sm font-medium hover:underline">Choose files</label>
                    <p className="text-[10px] text-muted-foreground mt-1">PDF, JPEG, PNG up to 5MB</p>
                  </div>
                  {files.length > 0 && <div className="mt-2 space-y-1">{files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted px-2 py-1 rounded text-xs">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-500 font-medium ml-2">Remove</button>
                    </div>
                  ))}</div>}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Preferred Date *</Label><Input type="date" required min={new Date().toISOString().split("T")[0]} value={schedule.scheduledDate} onChange={e => setSchedule({ ...schedule, scheduledDate: e.target.value })} /></div>
                  <div>
                    <Label>Preferred Time *</Label>
                    <Select required value={schedule.scheduledTime} onValueChange={v => setSchedule({ ...schedule, scheduledTime: v })}>
                      <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                      <SelectContent>
                        {["09:00 AM","10:00 AM","11:00 AM","12:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <h3 className="font-semibold text-sm pt-1">Service Address</h3>
                <div><Label>Street Address *</Label><Input required value={schedule.street} onChange={e => setSchedule({ ...schedule, street: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City *</Label><Input required value={schedule.city} onChange={e => setSchedule({ ...schedule, city: e.target.value })} /></div>
                  <div><Label>State *</Label><Input required value={schedule.state} onChange={e => setSchedule({ ...schedule, state: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Pincode *</Label><Input required pattern="[0-9]{6}" maxLength={6} value={schedule.pincode} onChange={e => setSchedule({ ...schedule, pincode: e.target.value })} /></div>
                  <div><Label>Landmark</Label><Input value={schedule.landmark} onChange={e => setSchedule({ ...schedule, landmark: e.target.value })} /></div>
                </div>
              </>
            )}

            <div><Label>Notes (optional)</Label><Textarea rows={2} placeholder="Special instructions..." value={notes} onChange={e => setNotes(e.target.value)} /></div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2 text-sm text-blue-800">
              <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
              <span>Payment of <strong>₹{service.price.toLocaleString("en-IN")}</strong> is collected <strong>after</strong> your service is completed by our agent.</span>
            </div>
            <div className="flex gap-3 pt-2 border-t">
              <Button type="submit" className="flex-1 bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]">
                {isGov ? "Submit Application" : "Confirm Booking"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
