import type { Booking, BookingStatus, BookingFilter } from "@/types";
import { bookings, uid, persist } from "@/data/seed";

export function getBookings(filter?: BookingFilter): Booking[] {
  let list = [...bookings];
  if (filter?.userId) list = list.filter(b => b.userId === filter.userId);
  if (filter?.staffId) list = list.filter(b => b.assignedStaffId === filter.staffId);
  if (filter?.status) list = list.filter(b => b.status === filter.status);
  if (filter?.type) list = list.filter(b => b.type === filter.type);
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getBooking(id: string): Booking | null {
  return bookings.find(b => b.id === id) || null;
}

export function createBooking(data: Omit<Booking, "id" | "createdAt" | "documents" | "staffProof" | "adminNotes" | "isPaid">): Booking {
  const booking: Booking = { id: uid(), ...data, documents: [], staffProof: [], adminNotes: "", isPaid: false, createdAt: new Date().toISOString() };
  bookings.push(booking);
  persist();
  return booking;
}

export function updateBookingStatus(id: string, status: BookingStatus, adminNotes?: string): Booking | null {
  const b = bookings.find(b => b.id === id);
  if (!b) return null;
  b.status = status;
  if (adminNotes !== undefined) b.adminNotes = adminNotes;
  persist();
  return b;
}

export function assignStaff(bookingId: string, staffId: string): Booking | null {
  const b = bookings.find(b => b.id === bookingId);
  if (!b) return null;
  b.assignedStaffId = staffId;
  if (b.status === "booked") b.status = "assigned";
  persist();
  return b;
}

export function markPaid(bookingId: string): Booking | null {
  const b = bookings.find(b => b.id === bookingId);
  if (b) b.isPaid = true;
  persist();
  return b || null;
}

export function addDocument(bookingId: string, filename: string, url: string): void {
  const b = bookings.find(b => b.id === bookingId);
  if (b) {
    b.documents.push({ name: filename, url });
    persist();
  }
}

export function addStaffProof(bookingId: string, filename: string, url: string): void {
  const b = bookings.find(b => b.id === bookingId);
  if (b) {
    b.staffProof.push({ name: filename, url });
    persist();
  }
}
