import type { Service } from "@/types";
import { services, uid } from "@/data/seed";

export function getServices(category?: string, search?: string): Service[] {
  let list = services.filter(s => s.isActive);
  if (category) list = list.filter(s => s.category === category);
  if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  return list;
}

export function getService(id: string): Service | null {
  return services.find(s => s.id === id) || null;
}

export function createService(data: Omit<Service, "id" | "isActive">): Service {
  const svc: Service = { id: uid(), ...data, isActive: true };
  services.push(svc);
  return svc;
}

export function updateService(id: string, data: Partial<Service>): Service | null {
  const idx = services.findIndex(s => s.id === id);
  if (idx === -1) return null;
  services[idx] = { ...services[idx], ...data };
  return services[idx];
}

export function deleteService(id: string): void {
  const svc = services.find(s => s.id === id);
  if (svc) svc.isActive = false;
}
