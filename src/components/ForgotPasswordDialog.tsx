import { useState } from "react";
import { toast } from "sonner";
import { requestPasswordReset, resetPassword } from "@/api/auth.api";
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
 * "Forgot password?" link + dialog. Works for customers and agents.
 * Step 1: enter email/mobile → a 6-digit code is emailed.
 * Step 2: enter the code + a new password.
 * On success calls onReset(emailOrPhone) so the login form can prefill.
 */
export default function ForgotPasswordDialog({
  defaultValue = "",
  onReset,
}: {
  defaultValue?: string;
  onReset?: (emailOrPhone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"request" | "reset">("request");
  const [emailOrPhone, setEmailOrPhone] = useState(defaultValue);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("request");
    setOtp(""); setPassword(""); setConfirm(""); setBusy(false);
  };

  const openDialog = () => {
    reset();
    setEmailOrPhone(defaultValue);
    setOpen(true);
  };

  const sendCode = async () => {
    if (!emailOrPhone.trim()) return toast.error("Enter your email or mobile number");
    setBusy(true);
    try {
      const msg = await requestPasswordReset(emailOrPhone.trim());
      toast.success(msg || "If an account matches, a code has been emailed.");
      setStep("reset");
    } catch (e) {
      toast.error((e as Error).message || "Could not send reset code");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (otp.trim().length < 6) return toast.error("Enter the 6-digit code from your email");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await resetPassword(emailOrPhone.trim(), otp.trim(), password);
      toast.success("Password reset! Please sign in with your new password.");
      onReset?.(emailOrPhone.trim());
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-xs text-gold font-medium hover:underline"
      >
        Forgot password?
      </button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              {step === "request"
                ? "Enter the email or mobile number on your account. We'll email a 6-digit code."
                : `Enter the 6-digit code sent to your email and choose a new password.`}
            </DialogDescription>
          </DialogHeader>

          {step === "request" ? (
            <div className="space-y-2">
              <Label htmlFor="fp-id">Email or mobile</Label>
              <Input
                id="fp-id"
                autoFocus
                placeholder="Enter email or number"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && sendCode()}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="fp-otp">6-digit code</Label>
                <Input
                  id="fp-otp"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-pw">New password</Label>
                <Input
                  id="fp-pw"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-confirm">Confirm new password</Label>
                <Input
                  id="fp-confirm"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-gold"
              >
                Didn't get a code? Resend
              </button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {step === "request" ? (
              <Button
                onClick={sendCode}
                disabled={busy}
                className="bg-gold font-semibold text-gold-foreground hover:bg-gold/90"
              >
                {busy ? "Sending…" : "Send code"}
              </Button>
            ) : (
              <Button
                onClick={doReset}
                disabled={busy}
                className="bg-gold font-semibold text-gold-foreground hover:bg-gold/90"
              >
                {busy ? "Resetting…" : "Reset password"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
