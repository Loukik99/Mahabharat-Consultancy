import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { serviceCategories, servicesByCategory, serviceById, categoryById } from "@/data/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { ServiceCategory, Service } from "@/types";
import { ChevronLeft, CheckCircle2, Info, FileText, ArrowRight } from "lucide-react";

export default function NewRequest() {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const preselected = serviceId ? serviceById(serviceId) : undefined;

  const [category, setCategory] = useState<ServiceCategory["id"] | null>(
    preselected ? preselected.category : null,
  );
  const [service, setService] = useState<Service | null>(preselected ?? null);

  const [applicant, setApplicant] = useState({
    fullName: user?.name || "",
    fatherName: "",
    dob: "",
    referenceNumber: "",
    additionalInfo: "",
  });
  const [notes, setNotes] = useState("");

  const services = useMemo(
    () => (category ? servicesByCategory(category).filter((s) => s.isActive) : []),
    [category],
  );

  const step = service ? 2 : 1;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || !category) return;
    const applicantDetails = {
      fullName: applicant.fullName.trim() || undefined,
      fatherName: applicant.fatherName.trim() || undefined,
      dob: applicant.dob || undefined,
      referenceNumber: applicant.referenceNumber.trim() || undefined,
      additionalInfo: applicant.additionalInfo.trim() || undefined,
    };
    const req = Req.createRequest({
      userId: user!.id,
      serviceId: service.id,
      category,
      applicantDetails,
      notes: notes.trim(),
    });
    toast.success("Request created! Now upload your documents.");
    navigate(`/requests/${req.id}`);
  };

  const back = () => {
    if (service && !preselected) {
      setService(null);
    } else if (category && !preselected) {
      setCategory(null);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={back} className="text-blue-600 text-sm font-medium hover:underline mb-4 inline-flex items-center gap-1">
        <ChevronLeft size={15} /> Back
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">New Service Request</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} of 2 — {step === 1 ? "choose a service" : "fill in details"}
        </p>
      </div>

      {/* Step 1 — pick category, then service */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="font-semibold mb-3 text-sm">1. Pick a category</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {serviceCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`text-left rounded-lg border p-3 transition-all ${category === c.id ? "border-blue-500 ring-2 ring-blue-100 bg-blue-50/50" : "hover:border-blue-300"}`}
                >
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.nameHi && <p className="text-xs text-muted-foreground">{c.nameHi}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                </button>
              ))}
            </div>
          </div>

          {category && (
            <div>
              <h2 className="font-semibold mb-3 text-sm">2. Pick a service</h2>
              <div className="space-y-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setService(s)}
                    className="w-full text-left rounded-lg border p-3 hover:border-blue-400 hover:bg-blue-50/40 transition-all flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-sm">{s.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{s.description}</span>
                      <span className="text-[11px] text-blue-600 font-medium">{s.priceLabel}</span>
                    </span>
                    <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
                {services.length === 0 && (
                  <p className="text-sm text-muted-foreground">No services in this category.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2 — details */}
      {step === 2 && service && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{service.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {categoryById(service.category)?.name} • {service.priceLabel}
              </p>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{service.description}</p>
              {service.processingTime && (
                <p className="text-xs">Processing time: <span className="font-medium text-foreground">{service.processingTime}</span></p>
              )}
            </CardContent>
          </Card>

          {service.requiredDocuments.length > 0 && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm">
              <p className="font-semibold text-xs mb-1.5 flex items-center gap-1.5"><FileText size={13} /> Documents you'll need to upload:</p>
              <ul className="space-y-1">
                {service.requiredDocuments.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 size={13} className="text-yellow-500 shrink-0" /> {d}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground mt-2">You can upload these on the next screen after creating the request.</p>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Applicant Details (optional)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label htmlFor="fullName">Full Name</Label><Input id="fullName" value={applicant.fullName} onChange={(e) => setApplicant({ ...applicant, fullName: e.target.value })} /></div>
                <div><Label htmlFor="fatherName">Father's Name</Label><Input id="fatherName" value={applicant.fatherName} onChange={(e) => setApplicant({ ...applicant, fatherName: e.target.value })} /></div>
                <div><Label htmlFor="dob">Date of Birth</Label><Input id="dob" type="date" value={applicant.dob} onChange={(e) => setApplicant({ ...applicant, dob: e.target.value })} /></div>
                <div><Label htmlFor="ref">Reference Number</Label><Input id="ref" placeholder="Aadhaar / PAN / Roll No. etc." value={applicant.referenceNumber} onChange={(e) => setApplicant({ ...applicant, referenceNumber: e.target.value })} /></div>
              </div>
              <div>
                <Label htmlFor="addl">Additional Info</Label>
                <Textarea id="addl" rows={2} value={applicant.additionalInfo} onChange={(e) => setApplicant({ ...applicant, additionalInfo: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <div>
            <Label htmlFor="notes">Instructions / Notes (optional)</Label>
            <Textarea id="notes" rows={3} placeholder="Anything we should know..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2 text-sm text-blue-800">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <span>
              Mahabharat Consultancy is an assistance / service center. We help you apply on the
              official government and service portals — we are not a government body and do not
              charge any official fee on their behalf. The final amount is confirmed by the shop.
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" className="flex-1 bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]">Create Request</Button>
            <Button type="button" variant="outline" onClick={back}>Back</Button>
          </div>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground mt-8">
        Need help choosing? <Link to="/services" className="text-blue-600 hover:underline">Browse all services</Link>
      </p>
    </div>
  );
}
