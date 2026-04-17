import { useState } from "react";
import { Link } from "react-router-dom";
import type { ServiceCategory } from "@/types";
import { getServices, createService, updateService, deleteService } from "@/api/services.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const empty = { name: "", description: "", category: "government" as ServiceCategory, price: "", requiredDocuments: "" };

export default function ManageServicesPage() {
  const [, rerender] = useState(0);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  const services = getServices();

  const openCreate = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (s: any) => {
    setForm({ name: s.name, description: s.description, category: s.category, price: String(s.price), requiredDocuments: s.requiredDocuments.join(", ") });
    setEditId(s.id); setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name: form.name, description: form.description, category: form.category as ServiceCategory, price: parseFloat(form.price), requiredDocuments: form.requiredDocuments ? form.requiredDocuments.split(",").map(d => d.trim()).filter(Boolean) : [] };
    if (editId) { updateService(editId, data); toast.success("Updated"); }
    else { createService(data); toast.success("Created"); }
    setOpen(false); rerender(n => n + 1);
  };

  const handleDelete = (id: string) => { deleteService(id); toast.success("Deactivated"); rerender(n => n + 1); };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage Services</h1>
          <Link to="/admin" className="text-blue-600 text-xs hover:underline">&larr; Dashboard</Link>
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" /> Add Service</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Service" : "Create Service"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Name *</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description *</Label><Textarea required rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as ServiceCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="government">Government</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="housekeeping">Housekeeping</SelectItem>
                    <SelectItem value="manpower">Manpower</SelectItem>
                    <SelectItem value="ecommerce">E-Commerce</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Price ({"\u20B9"}) *</Label><Input type="number" required min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
            </div>
            <div><Label>Required Docs (comma-separated)</Label><Input placeholder="Aadhar Card, PAN Card, ..." value={form.requiredDocuments} onChange={e => setForm({ ...form, requiredDocuments: e.target.value })} /></div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">Save</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Docs</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {services.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="capitalize">{s.category}</TableCell>
                <TableCell>{"\u20B9"}{s.price.toLocaleString("en-IN")}</TableCell>
                <TableCell>{s.requiredDocuments.length}</TableCell>
                <TableCell className="flex gap-2">
                  <button onClick={() => openEdit(s)} className="text-blue-600 hover:text-blue-800"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
