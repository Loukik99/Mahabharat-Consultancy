import type {
  User, Service, ServiceRequest, Payment, AuditLog, Notification, CallLog, Role,
} from "@/types";
import { serviceCatalog } from "@/data/catalog";

// ──────────────────────────────────────────────────────────────────
// Mock data store for Phase 1 (frontend-only).
//
// Holds the in-memory "database" persisted to localStorage. The API
// layer in src/api/* is the only thing that should mutate these
// arrays, so swapping to real HTTP calls in Phase 2 stays localised.
//
// Storage keys are versioned (mc2_*) so the new domain model does not
// collide with data saved by the previous showcase build.
// ──────────────────────────────────────────────────────────────────

const KEY = {
  users: "mc2_users",
  requests: "mc2_requests",
  payments: "mc2_payments",
  audit: "mc2_audit",
  notifications: "mc2_notifications",
  calls: "mc2_calls",
  services: "mc2_services",
  id: "mc2_id",
};

function load<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

// ── Seed users (demo accounts) ────────────────────────────────────
const SEED_USERS: User[] = [
  { id: "u-admin", name: "Owner Admin", email: "admin@mahabharat.com", phone: "9999999999", password: "admin123", role: "admin", isActive: true, createdAt: "2026-01-05T10:00:00Z" },
  { id: "u-agent1", name: "Rajesh Kumar", email: "rajesh@mahabharat.com", phone: "9888888888", password: "agent123", role: "agent", isActive: true, createdAt: "2026-01-10T10:00:00Z" },
  { id: "u-agent2", name: "Priya Sharma", email: "priya@mahabharat.com", phone: "9777777777", password: "agent123", role: "agent", isActive: true, createdAt: "2026-01-12T10:00:00Z" },
  { id: "u-cust1", name: "Amit Patel", email: "amit@example.com", phone: "9666666666", password: "customer123", role: "customer", isActive: true, createdAt: "2026-02-01T10:00:00Z", address: { street: "123 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" } },
  { id: "u-cust2", name: "Sunita Devi", email: "sunita@example.com", phone: "9555555555", password: "customer123", role: "customer", isActive: true, createdAt: "2026-03-15T10:00:00Z", address: { street: "45 Station Road", city: "Nagpur", state: "Maharashtra", pincode: "440001" } },
];

const now = "2026-06-16T09:00:00Z";

// ── Seed requests (across the status workflow) ────────────────────
const SEED_REQUESTS: ServiceRequest[] = [
  {
    id: "r1", requestNumber: "MC-1001", userId: "u-cust1", serviceId: "pan-card", category: "govt_docs",
    status: "submitted", applicantDetails: { fullName: "Amit Patel", additionalInfo: "Need a fresh PAN card" },
    notes: "Please apply as soon as possible.", adminNotes: "",
    documents: [{ id: "d1", label: "Identity Proof", fileName: "aadhaar.pdf", url: "", uploadedByRole: "customer", uploadedAt: "2026-06-14T10:00:00Z" }],
    deliverables: [], comments: [],
    statusHistory: [{ status: "submitted", byUserId: "u-cust1", byRole: "customer", at: "2026-06-14T10:00:00Z" }],
    priceLabel: "Price on request", isPaid: false, paymentApprovedByAdmin: false,
    createdAt: "2026-06-14T10:00:00Z", updatedAt: "2026-06-14T10:00:00Z",
  },
  {
    id: "r2", requestNumber: "MC-1002", userId: "u-cust1", serviceId: "passport", category: "govt_docs",
    status: "documents_required", applicantDetails: { fullName: "Amit Patel", additionalInfo: "Fresh passport" },
    notes: "", adminNotes: "Assigned to Rajesh", assignedAgentId: "u-agent1",
    documents: [{ id: "d2", label: "Aadhaar Card", fileName: "aadhaar.pdf", url: "", uploadedByRole: "customer", uploadedAt: "2026-06-12T10:00:00Z" }],
    deliverables: [],
    comments: [{ id: "c1", byUserId: "u-agent1", byRole: "agent", message: "Please also upload a clear birth certificate copy.", at: "2026-06-13T11:00:00Z" }],
    statusHistory: [
      { status: "submitted", byUserId: "u-cust1", byRole: "customer", at: "2026-06-12T10:00:00Z" },
      { status: "in_review", byUserId: "u-agent1", byRole: "agent", at: "2026-06-13T10:30:00Z" },
      { status: "documents_required", byUserId: "u-agent1", byRole: "agent", note: "Birth certificate missing", at: "2026-06-13T11:00:00Z" },
    ],
    priceLabel: "Price on request", isPaid: false, paymentApprovedByAdmin: false,
    createdAt: "2026-06-12T10:00:00Z", updatedAt: "2026-06-13T11:00:00Z",
  },
  {
    id: "r3", requestNumber: "MC-1003", userId: "u-cust1", serviceId: "gst-registration", category: "tax_gst",
    status: "in_progress", notes: "New shop registration.", adminNotes: "", assignedAgentId: "u-agent2",
    documents: [{ id: "d3", label: "PAN Card", fileName: "pan.pdf", url: "", uploadedByRole: "customer", uploadedAt: "2026-06-10T10:00:00Z" }],
    deliverables: [], comments: [],
    statusHistory: [
      { status: "submitted", byUserId: "u-cust1", byRole: "customer", at: "2026-06-10T10:00:00Z" },
      { status: "in_review", byUserId: "u-agent2", byRole: "agent", at: "2026-06-11T09:00:00Z" },
      { status: "in_progress", byUserId: "u-agent2", byRole: "agent", at: "2026-06-12T09:00:00Z" },
    ],
    priceLabel: "Price on request", isPaid: false, paymentApprovedByAdmin: false,
    createdAt: "2026-06-10T10:00:00Z", updatedAt: "2026-06-12T09:00:00Z",
  },
  {
    id: "r4", requestNumber: "MC-1004", userId: "u-cust1", serviceId: "itr-filing", category: "tax_gst",
    status: "waiting_payment", notes: "Salaried ITR.", adminNotes: "Work done, awaiting payment.", assignedAgentId: "u-agent2",
    documents: [{ id: "d4", label: "Form 16", fileName: "form16.pdf", url: "", uploadedByRole: "customer", uploadedAt: "2026-06-05T10:00:00Z" }],
    deliverables: [{ id: "del1", fileName: "ITR-Acknowledgement.pdf", url: "", uploadedByAgentId: "u-agent2", uploadedAt: "2026-06-09T15:00:00Z" }],
    comments: [],
    statusHistory: [
      { status: "submitted", byUserId: "u-cust1", byRole: "customer", at: "2026-06-05T10:00:00Z" },
      { status: "in_progress", byUserId: "u-agent2", byRole: "agent", at: "2026-06-06T10:00:00Z" },
      { status: "completed", byUserId: "u-agent2", byRole: "agent", at: "2026-06-09T15:00:00Z" },
      { status: "waiting_payment", byUserId: "u-agent2", byRole: "agent", at: "2026-06-09T15:05:00Z" },
    ],
    priceLabel: "Price on request", isPaid: false, paymentApprovedByAdmin: false,
    createdAt: "2026-06-05T10:00:00Z", updatedAt: "2026-06-09T15:05:00Z",
  },
  {
    id: "r5", requestNumber: "MC-1005", userId: "u-cust2", serviceId: "scholarship-forms", category: "exams_jobs",
    status: "delivered", notes: "Post-matric scholarship.", adminNotes: "Payment received in cash.", assignedAgentId: "u-agent1",
    documents: [{ id: "d5", label: "Marksheet", fileName: "marksheet.pdf", url: "", uploadedByRole: "customer", uploadedAt: "2026-05-20T10:00:00Z" }],
    deliverables: [{ id: "del2", fileName: "Scholarship-Form-Filled.pdf", url: "", uploadedByAgentId: "u-agent1", uploadedAt: "2026-05-24T12:00:00Z" }],
    comments: [],
    statusHistory: [
      { status: "submitted", byUserId: "u-cust2", byRole: "customer", at: "2026-05-20T10:00:00Z" },
      { status: "in_progress", byUserId: "u-agent1", byRole: "agent", at: "2026-05-21T10:00:00Z" },
      { status: "completed", byUserId: "u-agent1", byRole: "agent", at: "2026-05-24T12:00:00Z" },
      { status: "waiting_payment", byUserId: "u-agent1", byRole: "agent", at: "2026-05-24T12:05:00Z" },
      { status: "delivered", byUserId: "u-admin", byRole: "admin", note: "Payment received", at: "2026-05-25T09:00:00Z" },
    ],
    priceLabel: "Price on request", isPaid: true, paymentApprovedByAdmin: true, paymentId: "p1",
    createdAt: "2026-05-20T10:00:00Z", updatedAt: "2026-05-25T09:00:00Z",
  },
];

const SEED_PAYMENTS: Payment[] = [
  { id: "p1", requestId: "r5", userId: "u-cust2", amountLabel: "Price on request", method: "cash", status: "received", markedReceivedByAdminId: "u-admin", createdAt: "2026-05-25T09:00:00Z" },
];

const SEED_NOTIFICATIONS: Notification[] = [
  { id: "n1", userId: "u-cust1", message: "Agent requested a birth certificate for your Passport request (MC-1002).", type: "action", read: false, link: "#/requests/r2", at: "2026-06-13T11:00:00Z" },
  { id: "n2", userId: "u-cust1", message: "Your ITR Filing (MC-1004) is ready. Please complete payment.", type: "warning", read: false, link: "#/requests/r4", at: "2026-06-09T15:05:00Z" },
];

const SEED_AUDIT: AuditLog[] = [
  { id: "a1", actorId: "u-admin", actorRole: "admin", action: "payment_received", targetType: "request", targetId: "r5", meta: "MC-1005 marked paid (cash)", at: "2026-05-25T09:00:00Z" },
];

// ── Live arrays ───────────────────────────────────────────────────
export const users: User[] = load(KEY.users, SEED_USERS);
export const requests: ServiceRequest[] = load(KEY.requests, SEED_REQUESTS);
export const payments: Payment[] = load(KEY.payments, SEED_PAYMENTS);
export const auditLogs: AuditLog[] = load(KEY.audit, SEED_AUDIT);
export const notifications: Notification[] = load(KEY.notifications, SEED_NOTIFICATIONS);
export const callLogs: CallLog[] = load(KEY.calls, []);
// Services are seeded from the static catalog but admin-editable at runtime.
export const services: Service[] = load(KEY.services, serviceCatalog);

// ── Persistence ───────────────────────────────────────────────────
function safeSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota — ignore in mock */ }
}

export function persist(): void {
  safeSet(KEY.users, users);
  safeSet(KEY.payments, payments);
  safeSet(KEY.audit, auditLogs);
  safeSet(KEY.notifications, notifications);
  safeSet(KEY.calls, callLogs);
  safeSet(KEY.services, services);
  // Requests can hold large data-URL uploads — fall back to slim copy on quota error.
  try {
    localStorage.setItem(KEY.requests, JSON.stringify(requests));
  } catch {
    const slim = requests.map((r) => ({
      ...r,
      documents: r.documents.map((d) => ({ ...d, url: "" })),
      deliverables: r.deliverables.map((d) => ({ ...d, url: "" })),
    }));
    safeSet(KEY.requests, slim);
  }
}

// ── ID helpers ────────────────────────────────────────────────────
let _id = parseInt(localStorage.getItem(KEY.id) || "2000", 10);
export const uid = (prefix = "id"): string => {
  _id++;
  safeSet(KEY.id, _id);
  return `${prefix}-${_id}`;
};
export const nextRequestNumber = (): string => `MC-${1000 + requests.length + 1}`;

// ── Cross-cutting helpers (audit + notifications) ─────────────────
export function logAudit(actorId: string, actorRole: Role, action: string, targetType: string, targetId: string, meta?: string) {
  auditLogs.unshift({ id: uid("a"), actorId, actorRole, action, targetType, targetId, meta, at: new Date().toISOString() });
  persist();
}

export function notify(userId: string, message: string, type: Notification["type"] = "info", link?: string) {
  notifications.unshift({ id: uid("n"), userId, message, type, read: false, link, at: new Date().toISOString() });
  persist();
}

void now; // reserved for future seed timestamps
