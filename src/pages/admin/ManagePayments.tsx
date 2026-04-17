import { Link } from "react-router-dom";
import { getPayments } from "@/api/payments.api";
import { getUser } from "@/api/users.api";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ManagePaymentsPage() {
  const payments = getPayments();
  const totalRevenue = payments.filter(p => p.status === "completed").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <Link to="/admin" className="text-blue-600 text-xs hover:underline">&larr; Dashboard</Link>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-xl font-bold text-green-600">{"\u20B9"}{totalRevenue.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <Card><CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {payments.map(p => {
              const usr = getUser(p.userId);
              return (
                <TableRow key={p.id}>
                  <TableCell>{usr?.name} <span className="text-muted-foreground">({usr?.phone})</span></TableCell>
                  <TableCell className="font-medium">{"\u20B9"}{p.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="capitalize">{p.method}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              );
            })}
            {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
