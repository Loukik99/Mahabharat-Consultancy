import type { Service, ServiceCategory } from "@/types";
import { api } from "@/lib/apiClient";

export async function getCategories(): Promise<ServiceCategory[]> {
  const { data } = await api.get<{ categories: ServiceCategory[] }>("/services/categories");
  return data.categories;
}

export async function getServices(category?: string, search?: string, all?: boolean): Promise<Service[]> {
  const { data } = await api.get<{ services: Service[] }>("/services", {
    params: { category, search, all: all ? 1 : undefined },
  });
  return data.services;
}

export async function getService(id: string): Promise<Service | null> {
  try {
    const { data } = await api.get<{ service: Service }>(`/services/${id}`);
    return data.service;
  } catch {
    return null;
  }
}

export async function createService(input: Partial<Service>): Promise<Service> {
  const { data } = await api.post<{ service: Service }>("/services", input);
  return data.service;
}

export async function updateService(id: string, patch: Partial<Service>): Promise<Service> {
  const { data } = await api.patch<{ service: Service }>(`/services/${id}`, patch);
  return data.service;
}

export async function toggleService(id: string, isActive: boolean): Promise<Service> {
  const { data } = await api.patch<{ service: Service }>(`/services/${id}/toggle`, { isActive });
  return data.service;
}
