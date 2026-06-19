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

/** Step 1 of password reset — emails a 6-digit OTP to the matching account. */
export async function requestPasswordReset(emailOrPhone: string): Promise<string> {
  const { data } = await api.post<{ message: string }>("/auth/forgot-password", { emailOrPhone });
  return data.message;
}

/** Step 2 — verify the OTP and set a new password. User then signs in fresh. */
export async function resetPassword(emailOrPhone: string, otp: string, password: string): Promise<void> {
  await api.post("/auth/reset-password", { emailOrPhone, otp, password });
}

/** Permanently delete the signed-in user's own account (customers & agents). */
export async function deleteMyAccount(): Promise<void> {
  await api.delete("/account");
  tokenStore.clear();
}
