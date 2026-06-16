import { useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "@/types";
import { getCustomers, setUserActive, deleteUser } from "@/api/users.api";
import { listRequests } from "@/api/requests.api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Download } from "lucide-react";

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

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminCustomers() {
  const { user } = useAuth();
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);
  const [toDelete, setToDelete] = useState<User | null>(null);

  const customers = getCustomers();
  const reqCount = (id: string) => listRequests({ userId: id }).length;

  if (!user) return null;

  const handleToggle = (c: User) => {
    setUserActive(c.id, !c.isActive, { id: user.id });
    toast.success(c.isActive ? "Customer deactivated" : "Customer activated");
    refresh();
  };

  const handleDelete = () => {
    if (!toDelete) return;
    deleteUser(toDelete.id, { id: user.id });
    toast.success("Customer deleted");
    setToDelete(null);
    refresh();
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Name", "Email", "Phone", "City", "Joined", "Requests", "Active"]];
    customers.forEach((c) => rows.push([
      c.name, c.email, c.phone, c.address?.city ?? "",
      new Date(c.createdAt).toLocaleDateString("en-IN"), reqCount(c.id), c.isActive ? "Yes" : "No",
    ]));
    downloadCsv("customers.csv", rows);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Customers ({customers.length})</h1>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Manage customer accounts</p>

      <AdminNav active="/admin/customers" />

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Joined</TableHead><TableHead>Requests</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.email}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.address?.city ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{reqCount(c.id)}</TableCell>
                <TableCell><Switch checked={c.isActive} onCheckedChange={() => handleToggle(c)} /></TableCell>
                <TableCell><button onClick={() => setToDelete(c)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button></TableCell>
              </TableRow>
            ))}
            {customers.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No customers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete customer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes <strong>{toDelete?.name}</strong>. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
