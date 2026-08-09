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

export default function LoginPage() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const user = await login(emailOrPhone.trim(), password);
      // This is the customer door only — staff accounts are turned away here.
      if (user.role !== "customer") {
        logout();
        toast.error("This is the customer login. Staff, please use your staff login page.");
        return;
      }
      toast.success(`Welcome back, ${user.name}!`);
      navigate("/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <Seo {...pageSeo.login} />
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to track your service requests."
        footer={
          <>Don't have an account? <Link to="/signup" className="font-semibold text-gold hover:underline">Sign up</Link></>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emailOrPhone" className={authLabelClass}>Email or mobile</Label>
            <Input
              id="emailOrPhone"
              type="text"
              required
              autoComplete="username"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="Enter email or number"
              className={authInputClass}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className={authLabelClass}>Password</Label>
              <ForgotPasswordDialog
                defaultValue={emailOrPhone}
                onReset={(id) => setEmailOrPhone(id)}
              />
            </div>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className={authInputClass}
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-2xl bg-gold text-[15px] font-semibold text-gold-foreground shadow-glow-gold hover:bg-gold/90"
          >
            {submitting ? "Signing In…" : "Sign In"}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
