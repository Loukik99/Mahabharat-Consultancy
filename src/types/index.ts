// ──────────────────────────────────────────────────────────────────
// Mahabharat Consultancy — domain model
// Internet Café / Online Services Center
//
// Phase 1 (frontend) uses these shapes with mock/localStorage data.
// They are intentionally aligned with the planned backend models
// (User, ServiceCategory, Service, ServiceRequest, RequestDocument,
//  RequestStatusHistory, RequestComment, FinalDeliverable, Payment,
//  AgentPerformance, AuditLog, Notification, OfficialServiceLink) so
// the swap to real APIs in Phase 2 is mechanical.
// ──────────────────────────────────────────────────────────────────

// ── Roles ─────────────────────────────────────────────────────────
export type Role = "customer" | "agent" | "admin";

// ── Service taxonomy ──────────────────────────────────────────────
export type ServiceCategoryId =
  | "govt_docs"      // Aadhaar, PAN, Voter ID, Passport, certificates…
  | "tax_gst"        // GST, ITR, e-way bills, billing
  | "exams_jobs"     // scholarships, admissions, exam forms, results
  | "documents"      // resume, typing, print, scan, xerox, lamination, photos
  | "bills_recharge" // electricity/water bills, mobile/DTH/FASTag recharge
  | "business"       // company registration, seller registration
  | "other";         // any other / custom request

export interface ServiceCategory {
  id: ServiceCategoryId;
  name: string;        // English label
  nameHi?: string;     // optional Hindi label
  description: string;
  icon: string;        // lucide icon name
  accent: string;      // tailwind gradient classes for cards
}

// ── Request status workflow ───────────────────────────────────────
// Submitted → Documents Required → In Review → In Progress →
// Waiting for OTP → Waiting for Payment → Completed → Delivered
// (Rejected / Cancelled are terminal off-ramps)
export type RequestStatus =
  | "submitted"
  | "documents_required"
  | "in_review"
  | "in_progress"
  | "waiting_otp"
  | "waiting_payment"
  | "completed"
  | "delivered"
  | "rejected"
  | "cancelled";

export const REQUEST_STATUS_FLOW: RequestStatus[] = [
  "submitted",
  "documents_required",
  "in_review",
  "in_progress",
  "waiting_otp",
  "waiting_payment",
  "completed",
  "delivered",
];

export type PaymentMethod = "upi" | "cash" | "other";
export type PaymentStatus = "pending" | "received";

// ── Official external links (UIDAI, NSDL, GST portal, etc.) ────────
export interface OfficialServiceLink {
  label: string;
  url: string;
  note?: string;
}

// ── Entities ──────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string; // mock only — never do this in the real backend
  role: Role;
  address?: { street: string; city: string; state: string; pincode: string };
  isActive: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: ServiceCategoryId;
  /** Prices are not finalised yet — placeholder label only. */
  priceLabel: string;
  requiredDocuments: string[];
  officialLinks: OfficialServiceLink[];
  processingTime?: string;
  popular?: boolean;
  isActive: boolean;
}

export interface RequestDocument {
  id: string;
  /** the checklist item this satisfies, e.g. "Aadhaar Card" */
  label: string;
  fileName: string;
  /** data URL / object URL in Phase 1; real storage URL later */
  url: string;
  uploadedByRole: Role;
  uploadedAt: string;
}

export interface FinalDeliverable {
  id: string;
  fileName: string;
  url: string;
  uploadedByAgentId: string;
  uploadedAt: string;
}

export interface StatusHistoryEntry {
  status: RequestStatus;
  byUserId?: string;
  byRole: Role;
  note?: string;
  at: string;
}

export interface RequestComment {
  id: string;
  byUserId?: string;
  byRole: Role;
  message: string;
  /** internal admin/agent note not shown to the customer */
  internal?: boolean;
  at: string;
}

export interface ServiceRequest {
  id: string;
  requestNumber: string; // human-friendly, e.g. MC-1042
  userId: string;
  serviceId: string;
  category: ServiceCategoryId;
  status: RequestStatus;
  applicantDetails?: {
    fullName?: string;
    fatherName?: string;
    dob?: string;
    referenceNumber?: string; // generic ref (Aadhaar/PAN/etc., masked)
    additionalInfo?: string;
  };
  notes: string;             // customer instructions
  adminNotes?: string;       // internal (omitted from customer responses)
  assignedAgentId?: string;
  // Display fields enriched by the API (populated names), not stored as such.
  serviceName?: string;
  customerName?: string;
  assignedAgentName?: string;
  documents: RequestDocument[];
  deliverables: FinalDeliverable[];
  statusHistory: StatusHistoryEntry[];
  comments: RequestComment[];
  priceLabel: string;
  paymentId?: string;
  isPaid: boolean;
  /** download is only unlocked when admin marks payment received */
  paymentApprovedByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  requestId: string;
  requestNumber?: string; // enriched by the API
  userId: string;
  customerName?: string;  // enriched by the API
  amountLabel: string;
  method: PaymentMethod;
  status: PaymentStatus;
  markedReceivedByAdminId?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName?: string; // enriched by the API
  actorRole: Role;
  action: string;       // e.g. "status_change", "file_download", "payment_received"
  targetType: string;   // "request" | "user" | "payment" | "file"
  targetId: string;
  meta?: string;
  at: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: "info" | "action" | "success" | "warning";
  read: boolean;
  link?: string;
  at: string;
}

/** Secure masked call / OTP request log (provider integrated later). */
export interface CallLog {
  id: string;
  agentId: string;
  requestId: string;
  purpose: string; // e.g. "OTP for PAN application"
  status: "requested" | "connected" | "failed";
  at: string;
}

/** FreeJobAlert-style government job listing. */
export interface GovtJob {
  id: string;
  title: string;
  organization: string;
  sector: "central" | "state" | "defence" | "banking" | "railway" | "psu" | "other";
  qualification: string;
  vacancies?: string;
  location: string;
  lastDate: string;
  postedAt: string;
  officialUrl: string;
}

/** Derived at runtime from requests — not persisted. */
export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalAssigned: number;
  completed: number;
  pending: number;
  delayed: number;
}

// ── Filters ───────────────────────────────────────────────────────
export interface RequestFilter {
  userId?: string;
  agentId?: string;
  status?: RequestStatus | "all";
  category?: ServiceCategoryId | "all";
}
