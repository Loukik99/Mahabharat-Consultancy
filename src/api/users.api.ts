import type { User } from "@/types";
import { users, uid, persist } from "@/data/seed";

export function getUser(id: string): User | null {
  return users.find(u => u.id === id) || null;
}

export function getStaff(): User[] {
  return users.filter(u => u.role === "staff");
}

export function getCustomers(): User[] {
  return users.filter(u => u.role === "customer");
}

export function createStaff(data: { name: string; email: string; phone: string; password: string }): User {
  const user: User = { id: uid(), ...data, role: "staff", isActive: true, createdAt: new Date().toISOString() };
  users.push(user);
  persist();
  return user;
}
