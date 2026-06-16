import type { Service } from "@/types";
import { services, uid, persist } from "@/data/store";

export function getServices(category?: string, search?: string): Service[] {
  let list = services.filter((s) => s.isActive);
  if (category && category !== "all") list = list.filter((s) => s.category === category);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }
  return list;
}

export function getService(id: string): Service | null {
  return services.find((s) => s.id === id) || null;
}

export function createService(data: Omit<Service, "id" | "slug" | "isActive">): Service {
  const id = uid("svc");
  const svc: Service = { id, slug: id, ...data, isActive: true };
  services.push(svc);
  persist();
  return svc;
}

export function updateService(id: string, data: Partial<Service>): Service | null {
  const idx = services.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  services[idx] = { ...services[idx], ...data };
  persist();
  return services[idx];
}

export function toggleService(id: string, isActive: boolean): void {
  const svc = services.find((s) => s.id === id);
  if (svc) { svc.isActive = isActive; persist(); }
}
