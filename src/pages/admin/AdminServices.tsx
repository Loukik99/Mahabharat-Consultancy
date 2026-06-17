import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Service, ServiceCategory, ServiceCategoryId, OfficialServiceLink } from "@/types";
import { getServices, createService, updateService, toggleService, getCategories } from "@/api/services.api";
import { PRICE_PLACEHOLDER } from "@/data/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" }, { to: "/admin/requests", label: "Requests" },
  { to: "/admin/customers", label: "Customers" }, { to: "/admin/agents", label: "Agents" },
  { to: "/admin/payments", label: "Payments" }, { to: "/admin/services", label: "Services" },
  { to: "/admin/reports", label: "Reports" }, { to: "/admin/audit", label: "Audit" },
];

function AdminNav({ active }: { active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      {ADMIN_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${active === l.to ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100"}`}>{l.label}</Link>
      ))}
    </div>
  );
}

interface FormState {
  name: string;
  category: ServiceCategoryId;
  description: string;
  priceLabel: string;
  requiredDocuments: string;
  processingTime: string;
  linkLabel: string;
  linkUrl: string;
}

const emptyForm: FormState = {
  name: "",
  category: "govt_docs",
  description: "",
  priceLabel: PRICE_PLACEHOLDER,
  requiredDocuments: "",
  processingTime: "",
  linkLabel: "",
  linkUrl: "",
};

export default function AdminServices() {
  const [loading, setLoading] = useState(true);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [filter, setFilter] = useState<ServiceCategoryId | "all">("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    try {
      const [services, cats] = await Promise.all([
        getServices(undefined, undefined, true),
        getCategories(),
      ]);
      setAllServices(services);
      setCategories(cats);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [services, cats] = await Promise.all([
          getServices(undefined, undefined, true),
          getCategories(),
        ]);
        if (!active) return;
        setAllServices(services);
        setCategories(cats);
      } catch (e) {
        if (active) toast.error((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const services = useMemo(
    () => (filter === "all" ? allServices : allServices.filter((s) => s.category === filter)),
    [allServices, filter],
  );

  const openCreate = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const openEdit = (s: Service) => {
    setForm({
      name: s.name,
      category: s.category,
      description: s.description,
      priceLabel: s.priceLabel,
      requiredDocuments: s.requiredDocuments.join(", "),
      processingTime: s.processingTime ?? "",
      linkLabel: s.officialLinks[0]?.label ?? "",
      linkUrl: s.officialLinks[0]?.url ?? "",
    });
    setEditId(s.id);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const officialLinks: OfficialServiceLink[] =
      form.linkLabel.trim() && form.linkUrl.trim()
        ? [{ label: form.linkLabel.trim(), url: form.linkUrl.trim() }]
        : [];
    const data: Partial<Service> = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      priceLabel: form.priceLabel.trim() || PRICE_PLACEHOLDER,
      requiredDocuments: form.requiredDocuments
        ? form.requiredDocuments.split(",").map((d) => d.trim()).filter(Boolean)
        : [],
      officialLinks,
      processingTime: form.processingTime.trim() || undefined,
    };
    try {
      if (editId) {
        await updateService(editId, data);
        toast.success("Service updated");
      } else {
        await createService(data);
        toast.success("Service created");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggle = async (s: Service) => {
    try {
      await toggleService(s.id, !s.isActive);
      toast.success(s.isActive ? "Service hidden" : "Service activated");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Services ({services.length})</h1>
        <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" /> Add Service</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Manage the service catalog. Prices are placeholder labels only.</p>

      <AdminNav active="/admin/services" />

      <Card className="mb-5"><CardContent className="pt-4 pb-3 flex flex-wrap gap-3 items-center">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as ServiceCategoryId | "all")}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>

      <Card><CardContent className="pt-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Docs</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{categoryName(s.category)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.priceLabel}</TableCell>
                  <TableCell>{s.requiredDocuments.length}</TableCell>
                  <TableCell><Switch checked={s.isActive} onCheckedChange={() => handleToggle(s)} /></TableCell>
                  <TableCell><button onClick={() => openEdit(s)} className="text-orange-600 hover:text-orange-800"><Pencil size={15} /></button></TableCell>
                </TableRow>
              ))}
              {services.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No services in this category.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Service" : "Add Service"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ServiceCategoryId })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description *</Label><Textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Price Label</Label><Input value={form.priceLabel} onChange={(e) => setForm({ ...form, priceLabel: e.target.value })} placeholder={PRICE_PLACEHOLDER} /></div>
            <div><Label>Required Docs (comma-separated)</Label><Input placeholder="Aadhaar Card, PAN Card, ..." value={form.requiredDocuments} onChange={(e) => setForm({ ...form, requiredDocuments: e.target.value })} /></div>
            <div><Label>Processing Time</Label><Input value={form.processingTime} onChange={(e) => setForm({ ...form, processingTime: e.target.value })} placeholder="e.g. 5–15 days" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Official Link Label</Label><Input value={form.linkLabel} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })} placeholder="UIDAI" /></div>
              <div><Label>Official Link URL</Label><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">Save</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
