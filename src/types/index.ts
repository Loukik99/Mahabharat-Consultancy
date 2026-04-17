// ── Role & Enum Types ─────────────────────────────────────────────
export type Role = "customer" | "admin" | "staff";
export type ServiceCategory = "government" | "home" | "housekeeping" | "manpower" | "ecommerce";
export type BookingStatus = "pending" | "verified" | "submitted" | "completed" | "rejected" | "booked" | "assigned" | "in_progress" | "cancelled";
export type PaymentMethod = "razorpay" | "upi" | "cash";
export type PaymentStatus = "pending" | "completed" | "failed";

// ── Entity Interfaces ─────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  address?: { street: string; city: string; state: string; pincode: string };
  isActive: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  price: number;
  requiredDocuments: string[];
  isActive: boolean;
  officialUrl?: string;
}

export interface Booking {
  id: string;
  userId: string;
  serviceId: string;
  type: "government" | "home";
  status: BookingStatus;
  applicantDetails?: { fullName: string; fatherName: string; dob: string; aadharNumber: string; additionalInfo: string };
  scheduledDate?: string;
  scheduledTime?: string;
  address?: { street: string; city: string; state: string; pincode: string; landmark: string };
  assignedStaffId?: string;
  documents: { name: string; url: string }[];
  staffProof: { name: string; url: string }[];
  notes: string;
  adminNotes: string;
  amount: number;
  isPaid: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
}

// ── Filter Types ──────────────────────────────────────────────────
export interface BookingFilter {
  userId?: string;
  staffId?: string;
  status?: string;
  type?: string;
}
