/** Client-side mirror of server password policy (server remains authoritative). */
export function validatePasswordClient(password: string): string | null {
  const p = password || "";
  if (p.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(p)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(p)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(p)) return "Password must include a number";
  return null;
}

export const PASSWORD_HINT = "Min 10 chars, with upper, lower & a number";
