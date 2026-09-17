import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import ForgotPasswordDialog from "@/components/ForgotPasswordDialog";
import { AuthShell, AuthCard, authInputClass, authLabelClass } from "@/components/AuthCard";
import { Seo } from "@/components/Seo";
import { pageSeo } from "@/config/seo";
import { validatePasswordClient, PASSWORD_HINT } from "@/lib/passwordPolicy";

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = form.phone.trim();
    if (!/^[6-9][0-9]{9}$/.test(phone)) return toast.error("Enter a valid 10-digit mobile number");
    const pwErr = validatePasswordClient(form.password);
    if (pwErr) return toast.error(pwErr);
    if (form.password !== form.confirm) return toast.error("Passwords do not match");

    try {
      setSubmitting(true);
      await register({ name: form.name.trim(), email: form.email.trim(), phone, password: form.password });
      toast.success("Account created!");
      navigate("/dashboard");
    } catch (err) {
      toast.error((err as Error).message || "Could not create account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Seo {...pageSeo.signup} />
      <AuthCard
        title="Create your account"
        subtitle="Join Mahabharat Consultancy in under a minute."
        footer={
          <div className="space-y-2">
            <p>Already have an account? <Link to="/login" className="font-semibold text-gold hover:underline">Sign in</Link></p>
            <ForgotPasswordDialog />
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className={authLabelClass}>Full name</Label>
            <Input id="name" required value={form.name} onChange={update("name")} placeholder="Your name" className={authInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className={authLabelClass}>Email</Label>
            <Input id="email" type="email" required value={form.email} onChange={update("email")} placeholder="you@example.com" className={authInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className={authLabelClass}>Mobile number</Label>
            <Input id="phone" type="tel" required inputMode="numeric" maxLength={10} placeholder="10-digit mobile" value={form.phone} onChange={update("phone")} className={authInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className={authLabelClass}>Password</Label>
            <Input id="password" type="password" required minLength={10} value={form.password} onChange={update("password")} placeholder={PASSWORD_HINT} className={authInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className={authLabelClass}>Confirm password</Label>
            <Input id="confirm" type="password" required value={form.confirm} onChange={update("confirm")} placeholder="Re-enter password" className={authInputClass} />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-2xl bg-gold text-[15px] font-semibold text-gold-foreground shadow-glow-gold hover:bg-gold/90"
          >
            {submitting ? "Creating Account…" : "Create Account"}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
