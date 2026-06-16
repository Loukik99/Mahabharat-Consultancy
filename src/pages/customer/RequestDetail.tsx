import { useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as Req from "@/api/requests.api";
import { getPaymentForRequest, recordPayment } from "@/api/payments.api";
import { serviceById } from "@/data/catalog";
import { site, waLink } from "@/config/site";
import { StatusTimeline } from "@/components/StatusTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { PaymentMethod, RequestStatus } from "@/types";
import {
  ChevronLeft, FileText, Upload, Trash2, FileDown, Lock, MessageSquare,
  ShieldAlert, QrCode, Send, Pencil, XCircle, Lightbulb, Wallet,
} from "lucide-react";

const fileToDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const ACCEPTED = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_BYTES = 5 * 1024 * 1024;

const PAYMENT_STAGE: RequestStatus[] = ["waiting_payment", "completed", "delivered"];

// A simple inline decorative QR placeholder (NOT a scannable code).
function QrPlaceholder() {
  const cells = [
    "11111110101111111",
    "10000010001000001",
    "10111010111011101",
    "10111010001011101",
    "10111010101011101",
    "10000010111000001",
    "11111110101111111",
    "00000000110000000",
    "10110111011010110",
    "01001000100101001",
    "11011101110110110",
    "00100010001001000",
    "11111110101101011",
    "00000010110010010",
    "11111010011011101",
    "10000010101001001",
    "10111011110110111",
  ];
  return (
    <svg viewBox={`0 0 ${cells.length} ${cells.length}`} className="h-40 w-40" aria-hidden="true" role="presentation">
      <rect width={cells.length} height={cells.length} fill="white" />
      {cells.map((row, y) =>
        row.split("").map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1a1a2e" /> : null)),
      )}
    </svg>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const r = id ? Req.getRequest(id) : null;

  // upload form state
  const [docLabel, setDocLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  // edit + comment + payment
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(r?.notes ?? "");
  const [editDetails, setEditDetails] = useState(r?.applicantDetails ?? {});
  const [message, setMessage] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!r || r.userId !== user?.id) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShieldAlert className="mx-auto mb-3 text-muted-foreground/50" size={40} />
        <h1 className="text-lg font-semibold">Request not found</h1>
        <p className="text-sm text-muted-foreground mb-4">This request does not exist or you are not authorised to view it.</p>
        <Button asChild variant="outline"><Link to="/dashboard">Back to Dashboard</Link></Button>
      </div>
    );
  }

  const svc = serviceById(r.serviceId);
  const editable = Req.isEditable(r);
  const canDownload = Req.canDownload(r);
  const inPaymentStage = PAYMENT_STAGE.includes(r.status);
  const payment = getPaymentForRequest(r.id);
  const visibleComments = r.comments.filter((c) => !c.internal);
  const labelOptions = svc?.requiredDocuments ?? [];

  const onPickFile = () => {
    const chosen = docLabel === "__custom__" ? customLabel.trim() : docLabel;
    if (!chosen) {
      toast.error("Choose or type a document label first");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file type. Use images, PDF, Word or Excel.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("File too large. Maximum size is 5 MB.");
      return;
    }
    const label = docLabel === "__custom__" ? customLabel.trim() : docLabel;
    const url = await fileToDataUrl(file);
    Req.addDocument(r.id, { label, fileName: file.name, url }, "customer");
    toast.success("Document uploaded");
    setDocLabel("");
    setCustomLabel("");
    rerender();
  };

  const handleRemoveDoc = (docId: string) => {
    Req.removeDocument(r.id, docId);
    toast.success("Document removed");
    rerender();
  };

  const handleSaveEdit = () => {
    Req.updateRequest(r.id, { notes: editNotes, applicantDetails: editDetails });
    toast.success("Request updated");
    setEditing(false);
    rerender();
  };

  const handleComment = () => {
    const msg = message.trim();
    if (!msg) return;
    Req.addComment(r.id, { byUserId: user!.id, byRole: "customer", message: msg });
    setMessage("");
    toast.success("Message sent to the agent");
    rerender();
  };

  const handleCancel = () => {
    Req.setStatus(r.id, "cancelled", { id: user!.id, role: "customer" }, "Cancelled by customer");
    setConfirmCancel(false);
    toast.success("Request cancelled");
    rerender();
  };

  const handlePaid = () => {
    recordPayment(r.id, user!.id, method, r.priceLabel);
    toast.success("Payment recorded. Admin will verify and unlock your files.");
    rerender();
  };

  const download = (fileName: string, url: string) => {
    if (!url) {
      toast.message("This is a demo placeholder file — no actual file is attached.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const roleLabel = (role: string) => (role === "customer" ? "You" : role === "agent" ? "Agent" : "Admin");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm font-medium hover:underline mb-4 inline-flex items-center gap-1">
        <ChevronLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{svc?.name ?? "Service Request"}</h1>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{r.requestNumber}</span> • {r.priceLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(r.createdAt).toLocaleString("en-IN")} • Updated {new Date(r.updatedAt).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* DOCUMENTS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><FileText size={17} /> Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {r.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 bg-muted rounded-md px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{d.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {d.fileName} • {new Date(d.uploadedAt).toLocaleDateString("en-IN")} • by {roleLabel(d.uploadedByRole)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.url && (
                          <button onClick={() => download(d.fileName, d.url)} className="text-blue-600 hover:text-blue-800" title="Download">
                            <FileDown size={15} />
                          </button>
                        )}
                        {editable && (
                          <button onClick={() => handleRemoveDoc(d.id)} className="text-red-500 hover:text-red-700" title="Remove">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editable ? (
                <div className="border-2 border-dashed rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {r.status === "documents_required" ? "More documents required — add them below." : "Upload a document"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Document type</Label>
                      <Select value={docLabel} onValueChange={setDocLabel}>
                        <SelectTrigger><SelectValue placeholder="Select label" /></SelectTrigger>
                        <SelectContent>
                          {labelOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                          <SelectItem value="__custom__">Other (type below)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {docLabel === "__custom__" && (
                      <div>
                        <Label className="text-xs">Custom label</Label>
                        <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Extra file" />
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFile}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={onPickFile}>
                    <Upload size={14} className="mr-1.5" /> Choose file & upload
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Images, PDF, Word or Excel up to 5 MB.</p>
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800 flex items-start gap-2">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Our agent has started work — documents can no longer be changed here.{" "}
                    <a href={waLink(`Hello, I need to update documents for request ${r.requestNumber}`)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      Contact us on WhatsApp
                    </a>{" "}to change them.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DETAILS / EDIT */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Your Details & Notes</CardTitle>
              {editable && !editing && (
                <Button size="sm" variant="ghost" onClick={() => { setEditNotes(r.notes); setEditDetails(r.applicantDetails ?? {}); setEditing(true); }}>
                  <Pencil size={13} className="mr-1" /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {editing ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Full Name</Label><Input value={editDetails.fullName ?? ""} onChange={(e) => setEditDetails({ ...editDetails, fullName: e.target.value })} /></div>
                    <div><Label className="text-xs">Father's Name</Label><Input value={editDetails.fatherName ?? ""} onChange={(e) => setEditDetails({ ...editDetails, fatherName: e.target.value })} /></div>
                    <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={editDetails.dob ?? ""} onChange={(e) => setEditDetails({ ...editDetails, dob: e.target.value })} /></div>
                    <div><Label className="text-xs">Reference Number</Label><Input value={editDetails.referenceNumber ?? ""} onChange={(e) => setEditDetails({ ...editDetails, referenceNumber: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-xs">Additional Info</Label><Textarea rows={2} value={editDetails.additionalInfo ?? ""} onChange={(e) => setEditDetails({ ...editDetails, additionalInfo: e.target.value })} /></div>
                  <div><Label className="text-xs">Notes / Instructions</Label><Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} className="bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  {r.applicantDetails?.fullName && <p><span className="text-muted-foreground">Name:</span> {r.applicantDetails.fullName}</p>}
                  {r.applicantDetails?.fatherName && <p><span className="text-muted-foreground">Father:</span> {r.applicantDetails.fatherName}</p>}
                  {r.applicantDetails?.dob && <p><span className="text-muted-foreground">DOB:</span> {new Date(r.applicantDetails.dob).toLocaleDateString("en-IN")}</p>}
                  {r.applicantDetails?.referenceNumber && <p><span className="text-muted-foreground">Reference:</span> {r.applicantDetails.referenceNumber}</p>}
                  {r.applicantDetails?.additionalInfo && <p><span className="text-muted-foreground">Info:</span> {r.applicantDetails.additionalInfo}</p>}
                  {r.notes ? <p><span className="text-muted-foreground">Notes:</span> {r.notes}</p> : null}
                  {!r.applicantDetails?.fullName && !r.notes && (
                    <p className="text-muted-foreground">No details added.</p>
                  )}
                </>
              )}

              {editable && !editing && (
                <div className="pt-2 border-t">
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirmCancel(true)}>
                    <XCircle size={14} className="mr-1.5" /> Cancel Request
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PAYMENT */}
          {inPaymentStage && (
            <Card className="border-yellow-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Wallet size={17} /> Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm">
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-semibold text-lg">{r.priceLabel}</p>
                  {r.priceLabel === "Price on request" && (
                    <p className="text-xs text-muted-foreground">The final amount will be confirmed by the shop before you pay.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5"><QrCode size={14} /> Scan to Pay (GPay/UPI)</p>
                    <QrPlaceholder />
                    <div className="text-center">
                      <p className="font-mono text-sm font-semibold">{site.upiId}</p>
                      <p className="text-xs text-muted-foreground">{site.upiPayeeName}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">Demo placeholder — replace with the real UPI QR.</p>
                  </div>

                  <div className="space-y-3">
                    {payment ? (
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
                        <StatusBadge status={payment.status} />
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {payment.status === "received"
                            ? "Payment verified by the shop. Your files are unlocked below."
                            : "We've noted your payment. The shop will verify it shortly."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-xs">Payment method</Label>
                          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upi">UPI / GPay</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button className="w-full bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]" onClick={handlePaid}>I have paid</Button>
                        <p className="text-xs text-muted-foreground">
                          After you mark this paid, the shop must verify your payment before your final files unlock.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  <span>Never share your banking OTP, UPI PIN, or passwords with anyone.</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DOWNLOADS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><FileDown size={17} /> Final Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {r.deliverables.length === 0 ? (
                <p className="text-sm text-muted-foreground">No final files yet. They'll appear here once your work is done.</p>
              ) : canDownload ? (
                r.deliverables.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 bg-muted rounded-md px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{f.fileName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(f.uploadedAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => download(f.fileName, f.url)}>
                      <FileDown size={14} className="mr-1.5" /> Download
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-muted/60 border p-4 text-center">
                  <Lock className="mx-auto mb-2 text-muted-foreground/60" size={24} />
                  <p className="text-sm font-medium">{r.deliverables.length} file(s) ready</p>
                  <p className="text-xs text-muted-foreground">Files unlock after the shop confirms your payment.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* COMMENTS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare size={17} /> Agent Remarks & Messages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <div className="space-y-2">
                  {visibleComments.map((c) => (
                    <div key={c.id} className={`rounded-lg px-3 py-2 text-sm ${c.byRole === "customer" ? "bg-blue-50 ml-6" : "bg-muted mr-6"}`}>
                      <p className="text-[11px] font-semibold text-muted-foreground">{roleLabel(c.byRole)} • {new Date(c.at).toLocaleString("en-IN")}</p>
                      <p>{c.message}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <Textarea rows={2} placeholder="Message the agent..." value={message} onChange={(e) => setMessage(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={handleComment} disabled={!message.trim()}><Send size={14} /></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Lightbulb size={16} /> Progress</CardTitle></CardHeader>
            <CardContent><StatusTimeline request={r} /></CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel confirm dialog */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>
              This will cancel request {r.requestNumber}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep Request</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleCancel}>Yes, Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
