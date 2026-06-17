import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ServiceRequest, User, Payment } from "@/types";
import {
  getRequest, assignAgent, setStatus, addComment,
} from "@/api/requests.api";
import { getAgents } from "@/api/users.api";
import { getPayments, markPaymentReceived } from "@/api/payments.api";
import { serviceById } from "@/data/catalog";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileDown, User as UserIcon, CheckCircle, XCircle,
  Wallet, MessageSquare, ShieldAlert, Lock,
} from "lucide-react";

export default function AdminRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [r, setR] = useState<ServiceRequest | null>(null);
  const [agents, setAgents] = useState<User[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);

  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    if (!id) return;
    try {
      const [req, agentList, payments] = await Promise.all([
        getRequest(id),
        getAgents(),
        getPayments(),
      ]);
      setR(req);
      setAgents(agentList);
      setAgentId(req?.assignedAgentId ?? "");
      setPayment(req ? payments.find((p) => p.requestId === req.id) ?? null : null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      if (!id) { setLoading(false); return; }
      try {
        const [req, agentList, payments] = await Promise.all([
          getRequest(id),
          getAgents(),
          getPayments(),
        ]);
        if (!active) return;
        setR(req);
        setAgents(agentList);
        setAgentId(req?.assignedAgentId ?? "");
        setPayment(req ? payments.find((p) => p.requestId === req.id) ?? null : null);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const service = r ? serviceById(r.serviceId) : null;

  if (!r) return <p className="text-center py-20 text-muted-foreground">Request not found</p>;
  if (!user) return <p className="text-center py-20 text-muted-foreground">Not authorized</p>;

  const nameById = (uid: string) => agents.find((a) => a.id === uid)?.name ?? uid;

  const handleAssign = async () => {
    if (!agentId) return toast.error("Select an agent");
    try {
      await assignAgent(r.id, agentId);
      toast.success("Agent assigned");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return toast.error("Please provide a reason");
    try {
      await setStatus(r.id, "rejected", rejectReason.trim());
      await addComment(r.id, { message: `Request rejected: ${rejectReason.trim()}` });
      toast.success("Request rejected");
      setRejectOpen(false);
      setRejectReason("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return toast.error("Note is empty");
    try {
      await addComment(r.id, { message: note.trim(), internal: true });
      toast.success("Internal note added");
      setNote("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaymentReceived(r.id);
      toast.success("Payment marked received — files unlocked & request delivered");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const serviceName = service?.name ?? r.serviceId;
  const showPaymentAction = !r.paymentApprovedByAdmin && (r.status === "waiting_payment" || !!payment);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => navigate("/admin/requests")} className="text-orange-600 text-sm font-medium hover:underline mb-4 inline-block">&larr; Back to Requests</button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Overview */}
          <Card><CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-bold">{serviceName}</h1>
                <p className="text-xs text-muted-foreground">{r.requestNumber} · {r.priceLabel}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm p-3 bg-muted rounded-lg">
              <p className="flex items-center gap-1.5"><UserIcon size={14} className="text-muted-foreground" /> <span className="font-medium">{r.applicantDetails?.fullName ?? "—"}</span></p>
              <p className="flex items-center gap-1.5"><span className="text-muted-foreground">Created:</span> {new Date(r.createdAt).toLocaleString("en-IN")}</p>
            </div>

            {r.applicantDetails && Object.values(r.applicantDetails).some(Boolean) && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-xs mb-2">Applicant Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                  {r.applicantDetails.fullName && <p><span className="text-muted-foreground">Name:</span> {r.applicantDetails.fullName}</p>}
                  {r.applicantDetails.fatherName && <p><span className="text-muted-foreground">Father:</span> {r.applicantDetails.fatherName}</p>}
                  {r.applicantDetails.dob && <p><span className="text-muted-foreground">DOB:</span> {r.applicantDetails.dob}</p>}
                  {r.applicantDetails.referenceNumber && <p><span className="text-muted-foreground">Reference:</span> {r.applicantDetails.referenceNumber}</p>}
                  {r.applicantDetails.additionalInfo && <p className="sm:col-span-2"><span className="text-muted-foreground">Info:</span> {r.applicantDetails.additionalInfo}</p>}
                </div>
              </div>
            )}

            {r.notes && <div className="mt-3 p-2.5 bg-muted rounded text-xs"><span className="font-medium">Customer notes:</span> {r.notes}</div>}
            {r.adminNotes && <div className="mt-2 p-2.5 bg-amber-50 rounded text-xs"><span className="font-medium">Admin notes:</span> {r.adminNotes}</div>}
          </CardContent></Card>

          {/* Documents */}
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-2">Documents ({r.documents.length})</h3>
            {r.documents.length === 0 && <p className="text-xs text-muted-foreground">No documents uploaded.</p>}
            {r.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-muted p-2 rounded mb-1 text-xs">
                <span>{d.label} — {d.fileName} <span className="text-muted-foreground">({d.uploadedByRole})</span></span>
                <span className="flex items-center gap-1 text-muted-foreground"><FileDown size={12} /> Staff download</span>
              </div>
            ))}
          </CardContent></Card>

          {/* Deliverables */}
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-2">Final Deliverables ({r.deliverables.length})</h3>
            {r.deliverables.length === 0 && <p className="text-xs text-muted-foreground">No deliverables uploaded yet.</p>}
            {r.deliverables.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-emerald-50 p-2 rounded mb-1 text-xs">
                <span>{d.fileName} <span className="text-muted-foreground">· {new Date(d.uploadedAt).toLocaleDateString("en-IN")}</span></span>
                <span className="flex items-center gap-1 text-muted-foreground"><FileDown size={12} /> Staff download</span>
              </div>
            ))}
          </CardContent></Card>

          {/* Comments (incl internal) */}
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><MessageSquare size={15} /> Comments ({r.comments.length})</h3>
            <ul className="space-y-2 mb-4">
              {r.comments.map((c) => (
                <li key={c.id} className={`p-2.5 rounded text-xs ${c.internal ? "bg-amber-50 border border-amber-200" : "bg-muted"}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium">{nameById(c.byUserId)} <span className="text-muted-foreground">({c.byRole})</span></span>
                    {c.internal && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Internal</span>}
                  </div>
                  <p>{c.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(c.at).toLocaleString("en-IN")}</p>
                </li>
              ))}
              {r.comments.length === 0 && <li className="text-xs text-muted-foreground">No comments.</li>}
            </ul>
            <Label className="text-xs">Add internal note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="Visible to admin & agents only" />
            <Button size="sm" className="mt-2" onClick={handleAddNote}>Add Internal Note</Button>
          </CardContent></Card>
        </div>

        {/* Sidebar actions */}
        <div className="space-y-5">
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3">Status Timeline</h3>
            <StatusTimeline request={r} />
          </CardContent></Card>

          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><UserIcon size={15} /> Assign / Reassign Agent</h3>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.phone})</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full mt-3" size="sm" onClick={handleAssign}>{r.assignedAgentId ? "Reassign" : "Assign"}</Button>
          </CardContent></Card>

          {/* Payment */}
          <Card><CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Wallet size={15} /> Payment</h3>
            {payment ? (
              <div className="text-xs space-y-1 mb-3">
                <p><span className="text-muted-foreground">Amount:</span> {payment.amountLabel}</p>
                <p><span className="text-muted-foreground">Method:</span> {payment.method.toUpperCase()}</p>
                <div className="flex items-center gap-1.5"><span className="text-muted-foreground">Status:</span> <StatusBadge status={payment.status} /></div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">No payment recorded yet.</p>
            )}
            {r.paymentApprovedByAdmin ? (
              <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 p-2 rounded">
                <CheckCircle size={14} /> Payment approved — downloads unlocked.
              </div>
            ) : showPaymentAction ? (
              <>
                <p className="text-[11px] text-muted-foreground mb-2">Marking payment received unlocks the customer&apos;s downloads and moves the request to <strong>Delivered</strong>.</p>
                <Button className="w-full bg-green-600 hover:bg-green-700" size="sm" onClick={handleMarkPaid}>Mark Payment Received</Button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted p-2 rounded">
                <Lock size={14} /> Awaiting completion before payment.
              </div>
            )}
          </CardContent></Card>

          {/* Reject */}
          {r.status !== "rejected" && r.status !== "cancelled" && r.status !== "delivered" && (
            <Card><CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><ShieldAlert size={15} className="text-red-500" /> Danger Zone</h3>
              <Button variant="outline" size="sm" className="w-full text-red-600 border-red-300 hover:bg-red-50" onClick={() => setRejectOpen(true)}>
                <XCircle size={14} className="mr-1" /> Reject Request
              </Button>
            </CardContent></Card>
          )}
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject Request {r.requestNumber}</DialogTitle></DialogHeader>
          <Label className="text-xs">Reason (shared with the customer)</Label>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this request is being rejected" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleReject}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
