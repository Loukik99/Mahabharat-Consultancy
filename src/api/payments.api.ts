import type { Payment } from "@/types";
import { payments, uid, persist } from "@/data/seed";

export function getPayments(userId?: string): Payment[] {
  return userId ? payments.filter(p => p.userId === userId) : [...payments];
}

export function createPayment(data: Omit<Payment, "id" | "createdAt">): Payment {
  const payment: Payment = { id: uid(), ...data, createdAt: new Date().toISOString() };
  payments.push(payment);
  persist();
  return payment;
}
