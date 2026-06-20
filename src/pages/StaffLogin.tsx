import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, UserCog } from "lucide-react";
import ForgotPasswordDialog from "@/components/ForgotPasswordDialog";
import logoImg from "@/assets/logo.jpeg";

type StaffRole = "admin" | "agent";

/**
 * Staff-only sign in for agents and administrators. Not linked anywhere public —
 * reachable only by direct URL (/staff). Customers are turned away here.
 */
export default function StaffLoginPage() {
  const [role, setRole] = useState<StaffRole>("admin");
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
      // The chosen tab must match the account's actual role.
      if (user.role !== role) {
        logout();
        if (user.role === "customer") {
          toast.error("Customers should use the customer login page.");
        } else {
          toast.error(`This account is ${user.role === "admin" ? "an admin" : "an agent"}, switch to the "${user.role}" tab.`);
        }
        return;
      }
      toast.success(`Welcome back, ${user.name}!`);
      navigate(role === "admin" ? "/admin" : "/agent");
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
            <CardDescription>Sign in as {role === "admin" ? "an administrator" : "an agent"}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Choose which kind of staff account you're signing in with */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition-colors ${role === "admin" ? "border-navy bg-navy text-white" : "border-border text-navy hover:border-navy"}`}
              >
                <ShieldCheck size={15} /> Admin
              </button>
              <button
                type="button"
                onClick={() => setRole("agent")}
                className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition-colors ${role === "agent" ? "border-navy bg-navy text-white" : "border-border text-navy hover:border-navy"}`}
              >
                <UserCog size={15} /> Agent
              </button>
            </div>
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
