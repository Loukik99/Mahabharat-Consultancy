import type { Payment, PaymentMethod } from "@/types";
import { payments, requests, uid, persist, logAudit, notify } from "@/data/store";

export function getPayments(userId?: string): Payment[] {
  const list = userId ? payments.filter((p) => p.userId === userId) : [...payments];
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getPaymentForRequest(requestId: string): Payment | null {
  return payments.find((p) => p.requestId === requestId) || null;
}

/** Customer records that they have paid (e.g. via UPI). Status stays "pending"
 *  until the admin manually verifies and marks it received. */
export function recordPayment(requestId: string, userId: string, method: PaymentMethod, amountLabel: string): Payment {
  let p = payments.find((p) => p.requestId === requestId);
  if (!p) {
    p = { id: uid("p"), requestId, userId, amountLabel, method, status: "pending", createdAt: new Date().toISOString() };
    payments.push(p);
  } else {
    p.method = method;
  }
  const r = requests.find((r) => r.id === requestId);
  if (r) r.paymentId = p.id;
  persist();
  return p;
}

/** ADMIN ONLY — verifying payment unlocks the customer's downloads and
 *  moves the request to "delivered". */
export function markPaymentReceived(requestId: string, admin: { id: string }): void {
  const r = requests.find((r) => r.id === requestId);
  if (!r) return;

  let p = payments.find((p) => p.requestId === requestId);
  if (!p) {
    p = { id: uid("p"), requestId, userId: r.userId, amountLabel: r.priceLabel, method: "cash", status: "received", markedReceivedByAdminId: admin.id, createdAt: new Date().toISOString() };
    payments.push(p);
  } else {
    p.status = "received";
    p.markedReceivedByAdminId = admin.id;
  }
  r.paymentId = p.id;
  r.isPaid = true;
  r.paymentApprovedByAdmin = true;
  r.status = "delivered";
  r.statusHistory.push({ status: "delivered", byUserId: admin.id, byRole: "admin", note: "Payment verified", at: new Date().toISOString() });
  r.updatedAt = new Date().toISOString();

  logAudit(admin.id, "admin", "payment_received", "request", r.id, `${r.requestNumber} marked paid`);
  notify(r.userId, `Payment confirmed for ${r.requestNumber}. Your files are now available to download.`, "success", `#/requests/${r.id}`);
  persist();
}
