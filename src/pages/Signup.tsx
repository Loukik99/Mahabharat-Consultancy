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

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = form.phone.trim();
    if (!/^[6-9][0-9]{9}$/.test(phone)) return toast.error("Enter a valid 10-digit mobile number");
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");

    try {
      register({ name: form.name.trim(), email: form.email.trim(), phone, password: form.password });
      toast.success("Account created!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err?.message || "Could not create account");
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff] rounded-xl flex items-center justify-center mx-auto mb-2">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <CardTitle className="text-xl">Create Account</CardTitle>
            <CardDescription>Join Mahabharat Consultancy</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" required value={form.name} onChange={update("name")} placeholder="Your name" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={update("email")} placeholder="you@example.com" />
              </div>
              <div>
                <Label htmlFor="phone">Mobile Number</Label>
                <Input id="phone" type="tel" required inputMode="numeric" maxLength={10} placeholder="10-digit mobile" value={form.phone} onChange={update("phone")} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="At least 6 characters" />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input id="confirm" type="password" required value={form.confirm} onChange={update("confirm")} placeholder="Re-enter password" />
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff]">Create Account</Button>
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
