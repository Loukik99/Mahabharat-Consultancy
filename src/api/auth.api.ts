import type { User } from "@/types";
import { users, uid, persist } from "@/data/seed";

export function login(email: string, password: string): User | null {
  return users.find(u => u.email === email && u.password === password && u.isActive) || null;
}

export function register(data: { name: string; email: string; phone: string; password: string }): User {
  if (users.find(u => u.email === data.email)) throw new Error("Email already registered");
  const user: User = { id: uid(), ...data, role: "customer", isActive: true, createdAt: new Date().toISOString() };
  users.push(user);
  persist();
  return user;
}
