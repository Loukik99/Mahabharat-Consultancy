import axios from "axios";

// Base URL of the backend API.
// - Dev default: "/api" (same-origin) which the Vite dev server proxies to the
//   backend — avoids CORS/mixed-content issues behind a preview proxy.
// - Production (e.g. GitHub Pages): set VITE_API_URL to the absolute hosted
//   backend URL, e.g. https://mahabharat-api.onrender.com/api
const baseURL = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "mc2_token";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export const api = axios.create({ baseURL });

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap the response body and surface backend error messages as Error.message.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const msg =
      error?.response?.data?.message ||
      (error?.code === "ERR_NETWORK" ? "Cannot reach the server. Is the backend running?" : null) ||
      error?.message ||
      "Something went wrong";
    return Promise.reject(new Error(msg));
  }
);

export { baseURL };
