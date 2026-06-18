import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const user = await login(emailOrPhone.trim(), password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate(user.role === "admin" ? "/admin" : user.role === "agent" ? "/agent" : "/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = (e: string, p: string) => { setEmailOrPhone(e); setPassword(p); };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card className="rounded border-border">
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 bg-navy rounded flex items-center justify-center mx-auto mb-2">
              <span className="font-display text-gold font-bold text-xl">M</span>
            </div>
            <CardTitle className="font-display text-xl text-navy">Welcome Back</CardTitle>
            <CardDescription>Sign in to track your service requests</CardDescription>
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
                  placeholder="you@example.com or 10-digit mobile"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
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
              <Button type="submit" disabled={submitting} className="w-full bg-gold font-semibold text-gold-foreground hover:bg-gold/90">{submitting ? "Signing In…" : "Sign In"}</Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Don't have an account? <Link to="/signup" className="text-gold font-medium hover:underline">Sign Up</Link>
            </p>

            <div className="mt-5 p-3 bg-secondary rounded text-xs space-y-1.5">
              <p className="font-semibold text-navy">Demo Accounts (click to fill):</p>
              <button type="button" onClick={() => quickLogin("admin@mahabharat.com", "admin123")} className="block text-left w-full text-muted-foreground hover:text-gold">Admin: admin@mahabharat.com / admin123</button>
              <button type="button" onClick={() => quickLogin("rajesh@mahabharat.com", "agent123")} className="block text-left w-full text-muted-foreground hover:text-gold">Agent: rajesh@mahabharat.com / agent123</button>
              <button type="button" onClick={() => quickLogin("amit@example.com", "customer123")} className="block text-left w-full text-muted-foreground hover:text-gold">Customer: amit@example.com / customer123</button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
