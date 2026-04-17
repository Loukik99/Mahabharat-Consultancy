import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    try {
      register({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      toast.success("Account created!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Create Account</CardTitle>
            <CardDescription>Join Mahabharat Consultancy</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><Label>Full Name</Label><Input required value={form.name} onChange={update("name")} /></div>
              <div><Label>Email</Label><Input type="email" required value={form.email} onChange={update("email")} /></div>
              <div><Label>Phone</Label><Input type="tel" required pattern="[6-9][0-9]{9}" placeholder="10-digit mobile" value={form.phone} onChange={update("phone")} /></div>
              <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={update("password")} /></div>
              <div><Label>Confirm Password</Label><Input type="password" required value={form.confirm} onChange={update("confirm")} /></div>
              <Button type="submit" className="w-full">Create Account</Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account? <Link to="/login" className="text-blue-600 font-medium hover:underline">Sign In</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
