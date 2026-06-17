const mongoose = require("mongoose");

const REQUEST_STATUSES = [
  "submitted",
  "documents_required",
  "in_review",
  "in_progress",
  "waiting_otp",
  "waiting_payment",
  "completed",
  "delivered",
  "rejected",
  "cancelled",
];

// ── Embedded sub-documents (RequestDocument, FinalDeliverable,
//    RequestStatusHistory, RequestComment from the model list) ──────
// Storage fields are provider-agnostic: local disk uses `storedName`,
// Cloudinary uses `publicId`/`resourceType`/`format`.
const storageFields = {
  fileName: String,
  mimeType: String,
  size: Number,
  provider: { type: String, enum: ["local", "cloudinary"], default: "local" },
  storedName: String,  // local disk
  publicId: String,    // cloudinary
  resourceType: String,
  format: String,
};

const requestDocumentSchema = new mongoose.Schema(
  {
    label: String,                 // checklist item, e.g. "Aadhaar Card"
    ...storageFields,
    uploadedByRole: { type: String, enum: ["customer", "agent", "admin"] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } }
);

const deliverableSchema = new mongoose.Schema(
  {
    ...storageFields,
    uploadedByAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: REQUEST_STATUSES },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byRole: { type: String, enum: ["customer", "agent", "admin"] },
    note: String,
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

const commentSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byRole: { type: String, enum: ["customer", "agent", "admin"] },
    message: String,
    internal: { type: Boolean, default: false }, // not shown to customer
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

const applicantDetailsSchema = new mongoose.Schema(
  {
    fullName: String,
    fatherName: String,
    dob: String,
    referenceNumber: String,
    additionalInfo: String,
  },
  { _id: false }
);

const serviceRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    category: { type: String, required: true },
    status: { type: String, enum: REQUEST_STATUSES, default: "submitted", index: true },
    applicantDetails: applicantDetailsSchema,
    notes: { type: String, default: "" },
    adminNotes: { type: String, default: "" },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    documents: [requestDocumentSchema],
    deliverables: [deliverableSchema],
    statusHistory: [statusHistorySchema],
    comments: [commentSchema],
    priceLabel: { type: String, default: "Price on request" },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    isPaid: { type: Boolean, default: false },
    paymentApprovedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

serviceRequestSchema.statics.STATUSES = REQUEST_STATUSES;

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
