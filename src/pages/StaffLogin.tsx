import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import ForgotPasswordDialog from "@/components/ForgotPasswordDialog";
import logoImg from "@/assets/logo.jpeg";

/**
 * Staff-only sign in for agents and administrators. Not linked anywhere public —
 * reachable only by direct URL (/staff). Customers are turned away here.
 */
export default function StaffLoginPage() {
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
      if (user.role !== "agent" && user.role !== "admin") {
        logout();
        toast.error("This login is for staff only. Customers, please use the customer login.");
        return;
      }
      toast.success(`Welcome back, ${user.name}!`);
      navigate(user.role === "admin" ? "/admin" : "/agent");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card className="rounded border-border border-t-2 border-t-navy">
          <CardHeader className="text-center pb-4">
            <img src={logoImg} alt="Mahabharat Consultancy" className="mx-auto mb-2 h-14 w-auto object-contain" />
            <CardTitle className="font-display text-xl text-navy flex items-center justify-center gap-1.5">
              <ShieldCheck size={18} className="text-gold" /> Staff Login
            </CardTitle>
            <CardDescription>Agents &amp; administrators only</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="emailOrPhone">Email or Mobile</Label>
                <Input
                  id="emailOrPhone"
                  type="text"
                  required
                  autoComplete="username"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="Enter email or number"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
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
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-navy font-semibold text-white hover:bg-navy/90">{submitting ? "Signing In…" : "Sign In"}</Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Staff accounts are created by an administrator. There is no public sign-up.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
