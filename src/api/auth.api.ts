import type { User } from "@/types";
import { users, uid, persist, logAudit } from "@/data/store";

export function login(emailOrPhone: string, password: string): User | null {
  const id = emailOrPhone.trim().toLowerCase();
  const u = users.find(
    (u) => (u.email.toLowerCase() === id || u.phone === emailOrPhone.trim()) && u.password === password && u.isActive,
  );
  if (u) logAudit(u.id, u.role, "login", "user", u.id);
  return u || null;
}

export function register(data: { name: string; email: string; phone: string; password: string }): User {
  if (users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error("Email already registered");
  }
  if (users.find((u) => u.phone === data.phone)) {
    throw new Error("Mobile number already registered");
  }
  const user: User = {
    id: uid("u"),
    ...data,
    role: "customer",
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  logAudit(user.id, "customer", "register", "user", user.id);
  persist();
  return user;
}
