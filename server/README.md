# Mahabharat Consultancy — Backend API

Express + Mongoose REST API. Roles: **customer**, **agent**, **admin**.
HttpOnly cookie JWT sessions, RBAC from the database, payment-gated downloads,
audit logging, and hardened uploads.

## Setup

```bash
cd server
npm install
cp .env.example .env        # then edit .env — set a strong JWT_SECRET
npm run dev
```

### Database
- **Local dev (zero setup):** leave `MONGODB_URI` blank. In-memory MongoDB + auto-seed.
- **Persistent / production:** set `MONGODB_URI`. Create an admin with `npm run create-admin`.
  Do **not** run `npm run seed` against production.

### Critical environment variables
| Var | Purpose |
|-----|---------|
| `JWT_SECRET` | **Required in production** (≥32 random chars). Server **fails closed** if missing/weak. |
| `JWT_SECRET_ROTATED` | Set `true` after rotating away from any previously exposed secret. |
| `CLIENT_URL` | **Required in production** — comma-separated trusted frontend origins. |
| `VERCEL_PREVIEW_ORIGINS` | Optional exact preview origins (no `*.vercel.app` wildcard). |
| `MONGODB_URI` | Required in production. |
| `NODE_ENV` | Set `production` in production. |

## Seed (destructive — development only)

```bash
# PowerShell
$env:CONFIRM_SEED="YES"; npm run seed

# bash
CONFIRM_SEED=YES npm run seed
```

Blocked when `NODE_ENV=production`. Remote URIs also require `SEED_ALLOW_REMOTE=YES`.

### Local demo accounts (after confirmed seed only)
| Role | Login | Password |
|------|-------|----------|
| Admin | admin@mahabharat.local | DevAdmin!234 |
| Agent | rajesh@mahabharat.local | DevAgent!234 |
| Customer | amit@example.local | DevCust!2345 |

Never use these in production. Prefer `npm run create-admin` for real admins.

## Security tests

```bash
npm run test:security
```

## Security model (summary)
- Fail-closed JWT secret + `CLIENT_URL` in production; `MONGODB_URI` required in production
- HttpOnly + Secure + SameSite auth cookies; JWT **not** returned in JSON (XSS)
- Double-submit CSRF (`mc_csrf` + `X-CSRF-Token`) for cookie-authenticated mutations
- Bearer still accepted for API/tools (skips CSRF — token is not auto-attached by browsers)
- `tokenVersion` invalidates sessions after password reset, logout, and deactivation
- Strong password policy; bcrypt cost 12; account lockout after failed logins
- Per-route rate limits (login, signup, reset, uploads) + global API brake
- Role + ownership checks on every request/resource (DB role, never client role)
- Agent status allowlist (cannot mark delivered / skip payment)
- Magic-byte upload validation; path traversal guards; sanitized downloads
- Mongo operator stripping; allowlisted mass-assignment
- Tight CORS (no `*.vercel.app`); SPA security headers via `vercel.json`
