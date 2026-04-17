import { users } from "@/data/seed";
import { bookings } from "@/data/seed";
import { payments } from "@/data/seed";
import { services } from "@/data/seed";

export function getStats() {
  const completedPayments = payments.filter(p => p.status === "completed");
  return {
    totalBookings: bookings.length,
    pendingBookings: bookings.filter(b => ["pending", "booked"].includes(b.status)).length,
    completedBookings: bookings.filter(b => b.status === "completed").length,
    totalRevenue: completedPayments.reduce((s, p) => s + p.amount, 0),
    totalCustomers: users.filter(u => u.role === "customer").length,
    totalStaff: users.filter(u => u.role === "staff").length,
    totalServices: services.filter(s => s.isActive).length,
  };
}
