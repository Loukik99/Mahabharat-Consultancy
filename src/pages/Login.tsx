import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = login(email, password);
    if (user) {
      toast.success(`Welcome back, ${user.name}!`);
      navigate(user.role === "admin" ? "/admin" : user.role === "staff" ? "/staff" : "/dashboard");
    } else {
      toast.error("Invalid email or password");
    }
  };

  const quickLogin = (e: string, p: string) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" />
              </div>
              <Button type="submit" className="w-full">Sign In</Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Don't have an account? <Link to="/signup" className="text-blue-600 font-medium hover:underline">Sign Up</Link>
            </p>

            <div className="mt-5 p-3 bg-muted rounded-lg text-xs space-y-1.5">
              <p className="font-semibold text-foreground">Demo Accounts (click to fill):</p>
              <button onClick={() => quickLogin("admin@mahabharat.com", "admin123")} className="block text-left w-full hover:text-blue-600">Admin: admin@mahabharat.com / admin123</button>
              <button onClick={() => quickLogin("rajesh@mahabharat.com", "staff123")} className="block text-left w-full hover:text-blue-600">Staff: rajesh@mahabharat.com / staff123</button>
              <button onClick={() => quickLogin("amit@example.com", "customer123")} className="block text-left w-full hover:text-blue-600">Customer: amit@example.com / customer123</button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
