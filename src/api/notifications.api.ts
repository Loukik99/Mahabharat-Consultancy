import type { Notification } from "@/types";
import { notifications, persist } from "@/data/store";

export function getNotifications(userId: string): Notification[] {
  return notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function unreadCount(userId: string): number {
  return notifications.filter((n) => n.userId === userId && !n.read).length;
}

export function markRead(id: string): void {
  const n = notifications.find((n) => n.id === id);
  if (n) { n.read = true; persist(); }
}

export function markAllRead(userId: string): void {
  notifications.filter((n) => n.userId === userId).forEach((n) => (n.read = true));
  persist();
}
