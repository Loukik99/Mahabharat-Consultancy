# Mahabharat Consultancy — Backend API

Express + Mongoose REST API for the internet-café / online-services center.
Roles: **customer**, **agent**, **admin**. JWT auth with role-based access control,
file uploads, payment-gated downloads, audit logging, and a secure masked
OTP-call flow.

## Tech
- Node.js + Express
- MongoDB + Mongoose
- JWT (`jsonwebtoken`) + `bcryptjs`
- `multer` for uploads, `express-validator`, `helmet`, `cors`, `morgan`

## Setup

```bash
cd server
npm install
cp .env.example .env        # then edit .env
npm run dev                 # nodemon, auto-reload
# or
npm start
```

### Database
- **Local dev (zero setup):** leave `MONGODB_URI` blank in `.env`. The server
  starts an **in-memory MongoDB** automatically and seeds demo data on boot.
  (Data is ephemeral — it resets each restart.)
- **Persistent / production:** set `MONGODB_URI` to your MongoDB Atlas
  connection string, then run `npm run seed` once to load the catalog + demo users.

### Environment variables (`.env`)
| Var | Purpose |
|-----|---------|
| `PORT` | API port (default 5000) |
| `CLIENT_URL` | Allowed CORS origin (the frontend) |
| `MONGODB_URI` | Mongo connection string; blank = in-memory dev DB |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Token signing |
| `MAX_UPLOAD_MB` | Per-file upload limit (default 5) |
| `CALL_PROVIDER` | `stub` (default) or a masked-calling provider later |

## Demo accounts (after seed)
| Role | Login | Password |
|------|-------|----------|
| Admin | admin@mahabharat.com | admin123 |
| Agent | rajesh@mahabharat.com | agent123 |
| Customer | amit@example.com | customer123 |

## Seed
```bash
npm run seed     # wipes + reloads catalog, demo users and sample requests
```

## API overview
Base path: `/api`

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Services | `GET /services`, `GET /services/categories`, `GET /services/:id`, admin `POST/PATCH /services` |
| Jobs | `GET /jobs` (FreeJobAlert-style, read-only) |
| Requests | `GET/POST /requests`, `GET/PATCH /requests/:id`, `PATCH /requests/:id/status`, `/assign`, `/ready`, `POST /requests/:id/comments` |
| Documents | `POST /requests/:id/documents` (upload), `DELETE …/:docId`, `GET …/:docId/download` |
| Deliverables | `POST /requests/:id/deliverables` (agent/admin), `GET …/:delId/download` (**payment-gated**) |
| Payments | `POST /requests/:id/pay` (customer), `PATCH /requests/:id/payment/received` (**admin only**), `GET /payments` |
| OTP call | `POST /requests/:id/call` (agent, masked), `GET /requests/:id/calls` |
| Users | admin: `GET /users/customers`, `GET/POST /users/agents`, `PATCH /users/:id`, `/active`, `DELETE /users/:id` |
| Stats | admin: `GET /stats/admin`, `GET /stats/agents` |
| Audit | admin: `GET /audit` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `/read-all` |

## Security model
- **RBAC** on every protected route (`requireAuth` + `requireRole`).
- Customers see only their own requests; agents see only assigned tasks; admins see all.
- **Downloads of final deliverables are blocked for customers until an admin marks the payment received.**
- Agents never receive a customer's full phone number; the masked OTP-call flow
  connects via a provider (stubbed) without exposing the number.
- All sensitive actions (status changes, file downloads, payment approval,
  agent actions) are written to the `AuditLog`.
- Passwords are bcrypt-hashed and never returned in responses.

## Data models
`User`, `CustomerProfile`, `AgentProfile`, `ServiceCategory`, `Service`,
`ServiceRequest` (embeds `RequestDocument`, `FinalDeliverable`,
`RequestStatusHistory`, `RequestComment`), `Payment`, `AuditLog`,
`Notification`, `CallLog`. Official-service links are embedded on `Service`;
agent performance is derived at query time.

## Deployment (Render / Railway)
- Set `MONGODB_URI` (MongoDB Atlas), `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`.
- Build/start command: `npm install && npm start`.
- Note: uploaded files are stored on local disk (`uploads/`). For a platform with
  an ephemeral filesystem, move uploads to S3/Cloudinary (a later phase).
