import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { getCategories, getServices, getService } from "@/api/services.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import AnimatedList from "@/components/AnimatedList";
import type { ServiceCategory, Service } from "@/types";
import { ChevronLeft, Info, FileText, ArrowRight, Upload } from "lucide-react";

// Must match server upload + magic-byte policy (no GIF).
const ACCEPTED = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/webm", "video/quicktime",
];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov";
const MAX_BYTES = 5 * 1024 * 1024;

export default function NewRequest() {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [category, setCategory] = useState<ServiceCategory["id"] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [service, setService] = useState<Service | null>(null);
  const [preselected, setPreselected] = useState(false);

  const [applicant, setApplicant] = useState({
    fullName: user?.name || "",
    fatherName: "",
    dob: "",
    referenceNumber: "",
    additionalInfo: "",
  });
  const [notes, setNotes] = useState("");
  const [requiredFiles, setRequiredFiles] = useState<Record<string, File | null>>({});

  // Initial load: categories, plus preselected service when serviceId is present.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        if (serviceId) {
          const svc = await getService(serviceId);
          if (active && svc) {
            setService(svc);
            setCategory(svc.category);
            setPreselected(true);
            setRequiredFiles(Object.fromEntries((svc.requiredDocuments || []).map((d) => [d, null])));
          } else if (active) {
            const cats = await getCategories();
            if (active) setCategories(cats);
          }
        } else {
          const cats = await getCategories();
          if (active) setCategories(cats);
        }
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [serviceId]);

  // Load services whenever a category is chosen (and no preselected service).
  useEffect(() => {
    if (!category || preselected) return;
    let active = true;
    (async () => {
      setServicesLoading(true);
      try {
        const list = await getServices(category);
        if (active) setServices(list.filter((s) => s.isActive));
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (active) setServicesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [category, preselected]);

  const selectService = (s: Service) => {
    setService(s);
    setRequiredFiles(Object.fromEntries((s.requiredDocuments || []).map((d) => [d, null])));
  };

  const step = service ? 2 : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || submitting) return;

    const required = service.requiredDocuments || [];
    const missing = required.filter((label) => !requiredFiles[label]);
    if (missing.length) {
      toast.error(`Missing required documents: ${missing.join(", ")}`);
      return;
    }

    for (const label of required) {
      const file = requiredFiles[label];
      if (!file) continue;
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`"${label}": unsupported file type. Use JPEG/PNG/WebP, PDF, Word, Excel or MP4/WebM/MOV.`);
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`"${label}": file too large. Maximum size is 5 MB.`);
        return;
      }
    }

    const applicantDetails = {
      fullName: applicant.fullName.trim() || undefined,
      fatherName: applicant.fatherName.trim() || undefined,
      dob: applicant.dob || undefined,
      referenceNumber: applicant.referenceNumber.trim() || undefined,
      additionalInfo: applicant.additionalInfo.trim() || undefined,
    };
    setSubmitting(true);
    try {
      const created = await Req.createRequest({
        serviceId: service.id,
        applicantDetails,
        notes: notes.trim(),
      });
      for (const label of required) {
        const file = requiredFiles[label];
        if (file) await Req.uploadDocument(created.id, file, label);
      }
      toast.success(required.length ? "Request created with required documents." : "Request created!");
      navigate(`/requests/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  };

  const back = () => {
    if (service && !preselected) {
      setService(null);
      setRequiredFiles({});
    } else if (category && !preselected) {
      setCategory(null);
    } else {
      navigate(-1);
    }
  };

  const categoryName = categories.find((c) => c.id === (service?.category ?? category))?.name;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={back} className="text-sm font-medium text-navy hover:text-gold mb-4 inline-flex items-center gap-1 transition-colors">
        <ChevronLeft size={15} /> Back
      </button>

      <div className="mb-6">
        <p className="eyebrow text-gold">Get started</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">New Service Request</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} of 2, {step === 1 ? "choose a service" : "fill in details"}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
        </div>
      ) : (
        <>
          {/* Step 1 — pick category, then service */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-base font-semibold text-navy mb-3">1. Pick a category</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={`text-left rounded border p-3 transition-colors ${category === c.id ? "border-gold bg-secondary/50" : "border-border hover:border-gold"}`}
                    >
                      <p className="font-semibold text-sm text-navy">{c.name}</p>
                      {c.nameHi && <p className="font-hi text-xs text-muted-foreground">{c.nameHi}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {category && (
                <div>
                  <h2 className="font-display text-base font-semibold text-navy mb-3">2. Pick a service</h2>
                  {servicesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {services.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => selectService(s)}
                          className="w-full text-left rounded border border-border p-3 hover:border-gold transition-colors flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold text-sm text-navy">{s.name}</span>
                            <span className="block text-xs text-muted-foreground truncate">{s.description}</span>
                            <span className="text-[11px] text-gold font-medium">{s.priceLabel}</span>
                          </span>
                          <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                        </button>
                      ))}
                      {services.length === 0 && (
                        <p className="text-sm text-muted-foreground">No services in this category.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — details */}
          {step === 2 && service && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Card className="rounded border border-border border-l-2 border-l-gold">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-lg text-navy">{service.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {categoryName} • {service.priceLabel}
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
                <div className="p-3 rounded border border-amber-200 bg-amber-50/60 text-sm space-y-3">
                  <p className="font-semibold text-xs text-amber-800 flex items-center gap-1.5">
                    <FileText size={13} /> Required documents (mandatory before create)
                  </p>
                  <AnimatedList
                    enableArrowNavigation={false}
                    displayScrollbar
                    items={service.requiredDocuments.map((d) => (
                      <div key={d} className="space-y-1.5 py-1">
                        <Label className="text-xs text-foreground flex items-center gap-1.5">
                          <Upload size={12} className="text-gold shrink-0" /> {d}
                        </Label>
                        <Input
                          type="file"
                          accept={ACCEPT_ATTR}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setRequiredFiles((prev) => ({ ...prev, [d]: file }));
                          }}
                          className="text-xs"
                        />
                        {requiredFiles[d] && (
                          <p className="text-[11px] text-muted-foreground">{requiredFiles[d]?.name}</p>
                        )}
                      </div>
                    ))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Upload every listed document to create this request. Services with no required documents can be created without uploads.
                  </p>
                </div>
              )}

              {/* Applicant fields stay optional by design: catalog services enforce
                  requiredDocuments (files), not identity form fields. */}
              <Card className="rounded border border-border">
                <CardHeader className="pb-2"><CardTitle className="font-display text-base text-navy">Applicant Details (optional)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label htmlFor="fullName">Full Name</Label><Input id="fullName" value={applicant.fullName} onChange={(e) => setApplicant({ ...applicant, fullName: e.target.value })} /></div>
                    <div><Label htmlFor="fatherName">Father&apos;s Name</Label><Input id="fatherName" value={applicant.fatherName} onChange={(e) => setApplicant({ ...applicant, fatherName: e.target.value })} /></div>
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

              <div className="p-3 rounded border-l-2 border-gold bg-secondary/60 flex items-start gap-2 text-sm text-muted-foreground">
                <Info size={15} className="mt-0.5 shrink-0 text-gold" />
                <span>
                  Mahabharat Consultancy is an assistance / service center. We help you apply on the
                  official government and service portals. We are not a government body and do not
                  charge any official fee on their behalf. The final amount is confirmed by the shop.
                </span>
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1 bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
                  {submitting ? "Creating..." : "Create Request"}
                </Button>
                <Button type="button" variant="outline" onClick={back} disabled={submitting} className="border-navy/20 text-navy hover:text-navy">Back</Button>
              </div>
            </form>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted-foreground mt-8">
        Need help choosing? <Link to="/services" className="text-gold hover:underline">Browse all services</Link>
      </p>
    </div>
  );
}
