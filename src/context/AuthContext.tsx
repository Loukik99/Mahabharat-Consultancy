import { createContext, useContext, useState, type ReactNode } from "react";
import type { User } from "@/types";
import { login as authLogin, register as authRegister } from "@/api/auth.api";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => User | null;
  register: (data: { name: string; email: string; phone: string; password: string }) => User;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (email: string, password: string) => {
    const u = authLogin(email, password);
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
