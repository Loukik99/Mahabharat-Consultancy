const { AuditLog, Notification, ServiceRequest, User } = require("../models");

// Writes an audit log entry for security-sensitive actions.
async function audit(actor, action, targetType, targetId, meta) {
  try {
    await AuditLog.create({
      actor: actor?.id || actor?._id,
      actorRole: actor?.role || "system",
      action,
      targetType,
      targetId: String(targetId || ""),
      meta,
    });
  } catch (e) {
    console.error("audit failed:", e.message);
  }
}

// Creates an in-app notification for a user.
async function notify(userId, message, type = "info", link) {
  try {
    await Notification.create({ user: userId, message, type, link });
  } catch (e) {
    console.error("notify failed:", e.message);
  }
}

// Notifies every active admin (used for approval requests).
async function notifyAdmins(message, type = "action", link) {
  try {
    const admins = await User.find({ role: "admin", isActive: true }).select("_id");
    await Promise.all(admins.map((a) => Notification.create({ user: a._id, message, type, link })));
  } catch (e) {
    console.error("notifyAdmins failed:", e.message);
  }
}

// MC-#### request number, sequential-ish based on count.
async function nextRequestNumber() {
  const count = await ServiceRequest.estimatedDocumentCount();
  return `MC-${1000 + count + 1}`;
}

// Privacy: agents must never see a full customer phone number.
function maskPhone(phone, viewerRole) {
  if (!phone) return "";
  if (viewerRole === "admin") return phone;
  if (phone.length < 4) return "••••";
  return `${phone.slice(0, 2)}••••••${phone.slice(-2)}`;
}

module.exports = { audit, notify, notifyAdmins, nextRequestNumber, maskPhone };
