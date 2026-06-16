import type { User, Role } from "@/types";
import { users, uid, persist, logAudit } from "@/data/store";

export function getUser(id: string): User | null {
  return users.find((u) => u.id === id) || null;
}

export function getAgents(): User[] {
  return users.filter((u) => u.role === "agent");
}

export function getCustomers(): User[] {
  return users.filter((u) => u.role === "customer");
}

export function createAgent(data: { name: string; email: string; phone: string; password: string }, admin: { id: string }): User {
  if (users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) throw new Error("Email already in use");
  const user: User = { id: uid("u"), ...data, role: "agent", isActive: true, createdAt: new Date().toISOString() };
  users.push(user);
  logAudit(admin.id, "admin", "agent_created", "user", user.id, data.name);
  persist();
  return user;
}

export function updateUser(id: string, patch: Partial<User>, admin: { id: string }): User | null {
  const u = getUser(id);
  if (!u) return null;
  Object.assign(u, patch);
  logAudit(admin.id, "admin", "user_updated", "user", id);
  persist();
  return u;
}

export function setUserActive(id: string, isActive: boolean, admin: { id: string }): void {
  const u = getUser(id);
  if (!u) return;
  u.isActive = isActive;
  logAudit(admin.id, "admin", isActive ? "user_activated" : "user_deactivated", "user", id);
  persist();
}

export function deleteUser(id: string, admin: { id: string }): void {
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return;
  logAudit(admin.id, "admin", "user_deleted", "user", id, users[idx].name);
  users.splice(idx, 1);
  persist();
}

/**
 * Privacy: agents must never see a customer's full mobile number.
 * Returns a masked form like "98••••••70" unless the caller is admin.
 */
export function maskedPhone(phone: string, viewerRole: Role): string {
  if (viewerRole === "admin") return phone;
  if (phone.length < 4) return "••••";
  return `${phone.slice(0, 2)}••••••${phone.slice(-2)}`;
}
