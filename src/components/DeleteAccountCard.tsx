import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * "Danger zone" card that lets a customer or agent permanently delete their own
 * account. Requires typing DELETE to confirm; on success logs out and goes home.
 */
export default function DeleteAccountCard({ role }: { role: "customer" | "agent" }) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const consequence =
    role === "agent"
      ? "Your agent login will be removed. You can only delete your account once you have no active assigned tasks."
      : "Your profile, service requests, uploaded documents and payment history will be permanently deleted.";

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      toast.success("Your account has been deleted");
      navigate("/");
    } catch (e) {
      toast.error((e as Error).message || "Could not delete account");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-700">Delete account</h3>
          <p className="mt-1 text-sm text-red-700/80">{consequence} This action cannot be undone.</p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => { setConfirmText(""); setOpen(true); }}
          >
            Delete my account
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              {consequence} This <strong>cannot be undone</strong>. Type <strong>DELETE</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">Confirmation</Label>
            <Input
              id="confirm-delete"
              autoComplete="off"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
