import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { getService } from "@/api/services.api";
import { getUser, maskedPhone } from "@/api/users.api";
import { requestOtpCall, getCallLogs } from "@/api/calls.api";
import type { CallLog } from "@/types";
import { StatusTimeline } from "@/components/StatusTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertCircle, ShieldAlert, User, FileText, ExternalLink, Phone,
  Upload, CheckCircle2, Wallet, MessageSquare, PlayCircle,
  FileWarning, KeyRound, Lock, CheckCircle, XCircle,
} from "lucide-react";

const fileToDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const ACCEPTED = [
  "image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_SIZE = 5 * 1024 * 1024;

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // tick is used to force a re-read of the synchronous mock store
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const request = useMemo(() => (id ? Req.getRequest(id) : null), [id, tick]);

  // Local UI state
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsMissingText, setDocsMissingText] = useState("");
  const [otpPurpose, setOtpPurpose] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const [remarkInternal, setRemarkInternal] = useState(false);

  const callLogs: CallLog[] = useMemo(
    () => (id ? getCallLogs(id) : []),
    [id, tick]
  );

  // ── Least-privilege guard ───────────────────────────────────────
  if (!request || request.assignedAgentId !== user!.id) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate("/agent")}
          className="text-emerald-600 text-sm font-medium hover:underline mb-5 inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </button>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-center">
          <Lock size={40} className="mb-3 text-red-400" />
          <p className="font-semibold text-gray-700">Not assigned to you</p>
          <p className="text-sm mt-1 max-w-sm">
            This task is either not found or is not assigned to your account. You can only view tasks
            assigned to you.
          </p>
        </div>
      </div>
    );
  }

  const r = request;
  const service = getService(r.serviceId);
  const customer = getUser(r.userId);
  const requiredDocs = service?.requiredDocuments ?? [];
  const officialLinks = service?.officialLinks ?? [];

  const uploadedLabels = new Set(r.documents.map((d) => d.label.toLowerCase()));
  const missingDocs = requiredDocs.filter((d) => !uploadedLabels.has(d.toLowerCase()));

  const defaultPurpose = `OTP for ${service?.name ?? "service"}`;
  const otpValue = otpPurpose ?? defaultPurpose;

  // ── Actions ─────────────────────────────────────────────────────
  const handleStatus = (status: Parameters<typeof Req.setStatus>[1], successMsg: string) => {
    Req.setStatus(r.id, status, { id: user!.id, role: "agent" });
    toast.success(successMsg);
    refresh();
  };

  const handleRequestDocuments = () => {
    const note = docsMissingText.trim();
    if (!note) {
      toast.error("Please describe which documents are missing.");
      return;
    }
    Req.setStatus(r.id, "documents_required", { id: user!.id, role: "agent" }, note);
    Req.addComment(r.id, {
      byUserId: user!.id,
      byRole: "agent",
      message: `Documents required: ${note}`,
    });
    toast.success("Customer notified about the required documents.");
    setDocsMissingText("");
    setDocsDialogOpen(false);
    refresh();
  };

  const handleOtpCall = () => {
    const purpose = otpValue.trim() || `OTP for ${service?.name ?? "service"}`;
    try {
      requestOtpCall(r.id, user!.id, purpose);
      toast.success("Connecting secure call… the customer's number is never shown.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place the call.");
    }
  };

  const handleDeliverableUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`"${file.name}": unsupported file type. Use image, PDF, DOC or XLSX.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`"${file.name}": file is larger than 5MB.`);
        continue;
      }
      const url = await fileToDataUrl(file);
      Req.addDeliverable(r.id, { fileName: file.name, url }, user!.id);
      toast.success(`Uploaded "${file.name}".`);
    }
    refresh();
  };

  const handleMarkReady = () => {
    if (r.deliverables.length === 0) {
      toast.error("Upload the completed file(s) before marking ready for payment.");
      return;
    }
    Req.markReadyForPayment(r.id, { id: user!.id });
    toast.success("Marked ready for payment. Admin will verify the payment.");
    refresh();
  };

  const handleAddRemark = () => {
    const message = remarkText.trim();
    if (!message) {
      toast.error("Please write a remark.");
      return;
    }
    Req.addComment(r.id, {
      byUserId: user!.id,
      byRole: "agent",
      message,
      internal: remarkInternal,
    });
    toast.success(remarkInternal ? "Internal note added." : "Remark sent to the customer.");
    setRemarkText("");
    setRemarkInternal(false);
    refresh();
  };

  const openLink = (e: React.MouseEvent, url: string) => {
    if (!url) {
      e.preventDefault();
      toast("File is a demo placeholder — no file attached.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => navigate("/agent")}
        className="text-emerald-600 text-sm font-medium hover:underline mb-5 inline-flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{service?.name ?? "Service"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{r.requestNumber}</span> · {r.priceLabel}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* OTP safety warning — always visible */}
      <Alert className="mb-6 border-amber-200 bg-amber-50">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Security reminder</AlertTitle>
        <AlertDescription className="text-amber-700">
          Never ask customers for banking OTPs, UPI PINs, or passwords. Only request the OTP needed for the
          specific government service.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT — work area */}
        <div className="lg:col-span-2 space-y-5">

          {/* Customer info (limited) */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <User size={15} className="text-emerald-500" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Name</p>
                  <p className="font-medium">{customer?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Phone (masked)</p>
                  <p className="font-mono font-medium">
                    {customer ? maskedPhone(customer.phone, "agent") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">City</p>
                  <p className="font-medium">{customer?.address?.city ?? "—"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic pt-1">
                Full contact details are restricted. Use the secure call button to reach the customer.
              </p>
              {r.notes && (
                <div className="p-2.5 bg-gray-50 rounded-lg text-xs border">
                  <span className="font-semibold text-gray-700">Customer note:</span> {r.notes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents uploaded by customer */}
          <Card className="border-indigo-100">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText size={15} className="text-indigo-500" /> Customer Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {r.documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {r.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between bg-indigo-50 px-3 py-2 rounded-lg text-xs gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-indigo-800 truncate">{d.label}</p>
                        <p className="text-[10px] text-indigo-500 truncate">
                          {d.fileName} · {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                      <a
                        href={d.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => openLink(e, d.url)}
                        className="text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-1 shrink-0"
                      >
                        <ExternalLink size={11} /> Open
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {requiredDocs.length > 0 && (
                <div className="text-xs border-t pt-2.5">
                  <p className="font-semibold text-gray-700 mb-1.5">Checklist</p>
                  <ul className="space-y-1">
                    {requiredDocs.map((doc) => {
                      const have = uploadedLabels.has(doc.toLowerCase());
                      return (
                        <li key={doc} className="flex items-center gap-1.5">
                          {have
                            ? <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                            : <XCircle size={12} className="text-amber-500 shrink-0" />}
                          <span className={have ? "text-gray-700" : "text-amber-700"}>{doc}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {missingDocs.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-2">
                      {missingDocs.length} checklist item{missingDocs.length > 1 ? "s" : ""} still missing.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status controls */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Update Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handleStatus("in_review", "Moved to In Review.")}>
                  <PlayCircle size={14} className="mr-1" /> Start Review
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDocsDialogOpen(true)}>
                  <FileWarning size={14} className="mr-1" /> Request Documents
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleStatus("in_progress", "Work started.")}>
                  <PlayCircle size={14} className="mr-1" /> Start Work
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleStatus("waiting_otp", "Marked as waiting for OTP.")}>
                  <KeyRound size={14} className="mr-1" /> Need OTP
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Official websites */}
          {officialLinks.length > 0 && (
            <Card className="border-blue-100">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Official Websites</CardTitle>
              </CardHeader>
              <CardContent className="pb-4 flex flex-wrap gap-2">
                {officialLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                    title={link.note}
                  >
                    <ExternalLink size={13} /> {link.label}
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Secure OTP call */}
          <Card className="border-purple-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone size={15} className="text-purple-500" /> Call Customer for OTP
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <Alert className="border-red-200 bg-red-50 py-2.5">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-700 text-xs">
                  Never ask for banking OTPs, UPI PINs, or passwords. Request only the OTP for this service.
                  The customer's number is never shown to you.
                </AlertDescription>
              </Alert>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Purpose</label>
                <Input
                  value={otpValue}
                  onChange={(e) => setOtpPurpose(e.target.value)}
                  placeholder="Purpose of the call"
                  className="mt-1"
                />
              </div>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleOtpCall}
              >
                <Phone size={14} className="mr-1" /> Call Customer for OTP
              </Button>

              {callLogs.length > 0 && (
                <div className="border-t pt-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-700">Call history</p>
                  {callLogs.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs bg-purple-50 px-3 py-1.5 rounded-lg gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-purple-800">{c.purpose}</p>
                        <p className="text-[10px] text-purple-500">{new Date(c.at).toLocaleString("en-IN")}</p>
                      </div>
                      <span className="text-[10px] font-semibold capitalize text-purple-700 shrink-0">{c.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deliverables upload */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload size={15} className="text-emerald-500" /> Completed Files
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <label
                htmlFor="deliverableFile"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-all text-center"
              >
                <Upload size={20} className="text-gray-400" />
                <span className="text-xs text-gray-500">Click to upload completed file(s) — image, PDF, DOC or XLSX, max 5MB</span>
                <input
                  id="deliverableFile"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleDeliverableUpload}
                />
              </label>
              {r.deliverables.length > 0 && (
                <div className="space-y-1.5">
                  {r.deliverables.map((d) => (
                    <div key={d.id} className="flex items-center justify-between bg-emerald-50 px-3 py-2 rounded-lg text-xs gap-2">
                      <span className="font-medium text-emerald-800 truncate">{d.fileName}</span>
                      <a
                        href={d.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => openLink(e, d.url)}
                        className="text-emerald-600 font-semibold hover:text-emerald-800 flex items-center gap-1 shrink-0"
                      >
                        <ExternalLink size={11} /> Open
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mark ready for payment */}
          <Card className="border-yellow-200">
            <CardContent className="pt-4 pb-4 space-y-2">
              <Button
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold"
                onClick={handleMarkReady}
                disabled={r.deliverables.length === 0}
              >
                <Wallet size={15} className="mr-1.5" /> Mark Ready for Payment
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Payment is verified by an admin — agents cannot approve payments. Upload the completed file(s)
                before marking ready.
              </p>
            </CardContent>
          </Card>

          {/* Remarks */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare size={15} className="text-gray-500" /> Remarks
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {r.comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No remarks yet.</p>
              ) : (
                <div className="space-y-2">
                  {r.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-2.5 rounded-lg text-xs border ${
                        c.internal ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold capitalize text-gray-700">{c.byRole}</span>
                        {c.internal && (
                          <span className="text-[9px] font-semibold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Internal</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{new Date(c.at).toLocaleString("en-IN")}</span>
                      </div>
                      <p className="text-gray-700">{c.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 space-y-2">
                <Textarea
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  placeholder="Add a remark…"
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remarkInternal}
                      onChange={(e) => setRemarkInternal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Internal note (not shown to customer)
                  </label>
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={handleAddRemark}>
                    Add Remark
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — timeline */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle size={15} className="text-emerald-500" /> Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <StatusTimeline request={r} />
            </CardContent>
          </Card>

          <Card className="bg-gray-50">
            <CardContent className="pt-4 pb-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-gray-700 flex items-center gap-1.5">
                <Lock size={13} /> Privacy
              </p>
              <p>You only see tasks assigned to you. Customer phone numbers are masked and payments are approved by admins.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Request documents dialog */}
      <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Documents</DialogTitle>
            <DialogDescription>
              Describe what is missing. This will be shared with the customer and set the status to
              "Documents Required".
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={docsMissingText}
            onChange={(e) => setDocsMissingText(e.target.value)}
            placeholder="e.g. A clearer copy of your Aadhaar card and a recent passport photo."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsDialogOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleRequestDocuments}>
              <CheckCircle2 size={15} className="mr-1" /> Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
