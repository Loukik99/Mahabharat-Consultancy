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

// Call-permission / call log. An agent requests permission to call a customer;
// an admin approves or denies; once approved the agent may call and mark it done.
const callLogSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    purpose: String,
    status: { type: String, enum: ["pending", "approved", "denied", "completed"], default: "pending", index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
  },
  { timestamps: { createdAt: "at", updatedAt: "updatedAt" } }
);

module.exports = {
  AuditLog: mongoose.model("AuditLog", auditLogSchema),
  Notification: mongoose.model("Notification", notificationSchema),
  CallLog: mongoose.model("CallLog", callLogSchema),
};
