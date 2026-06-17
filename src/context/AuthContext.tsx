import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@/types";
import { login as apiLogin, register as apiRegister, fetchMe, logout as apiLogout } from "@/api/auth.api";
import { tokenStore } from "@/lib/apiClient";

interface AuthContextType {
  user: User | null;
  loading: boolean; // true while restoring the session on first load
  login: (emailOrPhone: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from a stored token.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!tokenStore.get()) { setLoading(false); return; }
      try {
        const me = await fetchMe();
        if (active) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const login = async (emailOrPhone: string, password: string) => {
    const u = await apiLogin(emailOrPhone, password);
    setUser(u);
    return u;
  };

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const u = await apiRegister(data);
    setUser(u);
    return u;
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
