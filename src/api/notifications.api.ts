import type { Notification } from "@/types";
import { api } from "@/lib/apiClient";

export async function getNotifications(): Promise<{ notifications: Notification[]; unread: number }> {
  const { data } = await api.get<{ notifications: Notification[]; unread: number }>("/notifications");
  return { notifications: data.notifications, unread: data.unread };
}

export async function markRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`, {});
}

export async function markAllRead(): Promise<void> {
  await api.patch("/notifications/read-all", {});
}
