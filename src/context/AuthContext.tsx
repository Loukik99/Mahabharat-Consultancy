import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@/types";
import { login as authLogin, register as authRegister } from "@/api/auth.api";
import { getUser } from "@/api/users.api";

interface AuthContextType {
  user: User | null;
  login: (emailOrPhone: string, password: string) => User | null;
  register: (data: { name: string; email: string; phone: string; password: string }) => User;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_KEY = "mc2_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Restore session across reloads.
    try {
      const id = localStorage.getItem(SESSION_KEY);
      return id ? getUser(id) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (user) localStorage.setItem(SESSION_KEY, user.id);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }, [user]);

  const login = (emailOrPhone: string, password: string) => {
    const u = authLogin(emailOrPhone, password);
    if (u) setUser(u);
    return u;
  };

  const register = (data: { name: string; email: string; phone: string; password: string }) => {
    const u = authRegister(data);
    setUser(u);
    return u;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
