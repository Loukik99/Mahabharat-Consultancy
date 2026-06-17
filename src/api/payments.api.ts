import type { Payment } from "@/types";
import { api } from "@/lib/apiClient";

export async function getPayments(): Promise<Payment[]> {
  const { data } = await api.get<{ payments: Payment[] }>("/payments");
  return data.payments;
}

// Customer records that they have paid (status stays pending until admin verifies).
export async function recordPayment(requestId: string, method: "upi" | "cash" | "other"): Promise<Payment> {
  const { data } = await api.post<{ payment: Payment }>(`/requests/${requestId}/pay`, { method });
  return data.payment;
}

// ADMIN ONLY — unlocks the customer's downloads and marks the request delivered.
export async function markPaymentReceived(requestId: string): Promise<Payment> {
  const { data } = await api.patch<{ payment: Payment }>(`/requests/${requestId}/payment/received`, {});
  return data.payment;
}
