const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String, enum: ["customer", "agent", "admin", "system"] },
    action: { type: String, required: true }, // e.g. "status_change", "file_download"
    targetType: String,                        // "request" | "user" | "payment" | "file"
    targetId: String,
    meta: String,
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["info", "action", "success", "warning"], default: "info" },
    read: { type: Boolean, default: false },
    link: String,
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

// Secure masked-call / OTP request log. The customer's real number is never stored here.
const callLogSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    purpose: String,
    status: { type: String, enum: ["requested", "connected", "failed"], default: "requested" },
    provider: { type: String, default: "stub" },
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

module.exports = {
  AuditLog: mongoose.model("AuditLog", auditLogSchema),
  Notification: mongoose.model("Notification", notificationSchema),
  CallLog: mongoose.model("CallLog", callLogSchema),
};
