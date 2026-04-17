import { useState } from "react";
import { Link } from "react-router-dom";
import { getStaff, createStaff } from "@/api/users.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function ManageStaffPage() {
  const [, rerender] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const staff = getStaff();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      createStaff(form);
      toast.success("Staff member created");
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "" });
      rerender(n => n + 1);
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage Staff</h1>
          <Link to="/admin" className="text-blue-600 text-xs hover:underline">&larr; Dashboard</Link>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" /> Add Staff</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Full Name *</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone *</Label><Input type="tel" required pattern="[6-9][0-9]{9}" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Password *</Label><Input type="password" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
            <div className="flex gap-2"><Button type="submit" className="flex-1">Create</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Card><CardContent className="pt-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {staff.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.email}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell>{s.isActive ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">Active</span> : <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold">Inactive</span>}</TableCell>
              </TableRow>
            ))}
            {staff.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No staff yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
