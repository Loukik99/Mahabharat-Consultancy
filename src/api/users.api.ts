import type { User } from "@/types";
import { api } from "@/lib/apiClient";

export async function getCustomers(): Promise<User[]> {
  const { data } = await api.get<{ customers: User[] }>("/users/customers");
  return data.customers;
}

export async function getAgents(): Promise<User[]> {
  const { data } = await api.get<{ agents: User[] }>("/users/agents");
  return data.agents;
}

export async function createAgent(input: { name: string; email: string; phone: string; password: string }): Promise<User> {
  const { data } = await api.post<{ agent: User }>("/users/agents", input);
  return data.agent;
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User> {
  const { data } = await api.patch<{ user: User }>(`/users/${id}`, patch);
  return data.user;
}

export async function setUserActive(id: string, isActive: boolean): Promise<User> {
  const { data } = await api.patch<{ user: User }>(`/users/${id}/active`, { isActive });
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}
