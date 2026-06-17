import type { User } from "@/types";
import { api, tokenStore } from "@/lib/apiClient";

interface AuthResult { token: string; user: User; }

export async function login(emailOrPhone: string, password: string): Promise<User> {
  const { data } = await api.post<{ token: string; user: User }>("/auth/login", { emailOrPhone, password });
  tokenStore.set(data.token);
  return data.user;
}

export async function register(input: { name: string; email: string; phone: string; password: string }): Promise<User> {
  const { data } = await api.post<AuthResult>("/auth/register", input);
  tokenStore.set(data.token);
  return data.user;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>("/auth/me");
  return data.user;
}

export function logout(): void {
  tokenStore.clear();
}
