import axios from "axios";

// Base URL of the backend API.
// - Dev default: "/api" (same-origin via Vite proxy)
// - Production: same-origin "/api" on Vercel, or VITE_API_URL if split host
const baseURL = import.meta.env.VITE_API_URL || "/api";

// Session presence flag only — never store the JWT in localStorage (XSS risk).
// Auth is carried by an HttpOnly cookie set by the API.
const SESSION_KEY = "mc2_session";
const CSRF_COOKIE = "mc_csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const tokenStore = {
  get: () => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set: (_t?: string) => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
      // Purge any legacy localStorage JWT from older builds.
      localStorage.removeItem("mc2_token");
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("mc2_token");
    } catch {
      /* ignore */
    }
  },
};

export const api = axios.create({
  baseURL,
  withCredentials: true, // send HttpOnly auth cookie
});

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (!["get", "head", "options"].includes(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) {
      config.headers = config.headers || {};
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      tokenStore.clear();
    }
    const msg =
      error?.response?.data?.message ||
      (error?.code === "ERR_NETWORK" ? "Cannot reach the server. Is the backend running?" : null) ||
      error?.message ||
      "Something went wrong";
    return Promise.reject(new Error(msg));
  }
);

export { baseURL };
