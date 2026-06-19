const { User, CustomerProfile, AgentProfile, ServiceRequest, Payment, Notification } = require("../models");
const { signToken } = require("../middleware/auth");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeUser } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const { removeStoredFile } = require("../utils/storage");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/mailer");
const bcrypt = require("bcryptjs");

// POST /api/auth/register  (customers only)
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) throw new ApiError(400, "All fields are required");

  const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
  if (exists) throw new ApiError(409, "Email or mobile number already registered");

  const user = new User({ name, email, phone, role: "customer" });
  user.password = password;
  await user.save();
  await CustomerProfile.create({ user: user._id });
  await audit(user, "register", "user", user._id);

  // Send the welcome email (fire-and-forget; never blocks or fails signup).
  sendWelcomeEmail(user);

  res.status(201).json({ success: true, token: signToken(user), user: serializeUser(user) });
});

// POST /api/auth/login  (email OR phone + password)
exports.login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;
  if (!emailOrPhone || !password) throw new ApiError(400, "Credentials required");

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: emailOrPhone.trim() }] }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, "Invalid credentials");
  if (!user.isActive) throw new ApiError(403, "Your account has been deactivated");

  await audit(user, "login", "user", user._id);
  res.json({ success: true, token: signToken(user), user: serializeUser(user) });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: serializeUser(req.user) });
});

// Generic response so the endpoint never reveals which emails/phones exist.
const RESET_SENT_MSG = "If an account matches, a reset code has been sent to its email.";

// POST /api/auth/forgot-password  { emailOrPhone }
// Emails a 6-digit OTP (valid 10 min) to the matching account. Works for any role.
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone) throw new ApiError(400, "Email or mobile number is required");

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: emailOrPhone.trim() }] });

  // Always return the same message; only send mail when a (active) user exists.
  if (user && user.isActive) {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    user.resetOtpHash = await bcrypt.hash(otp, 10);
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    await audit(user, "password_reset_requested", "user", user._id);
    sendPasswordResetEmail(user, otp); // fire-and-forget
  }

  res.json({ success: true, message: RESET_SENT_MSG });
});

// POST /api/auth/reset-password  { emailOrPhone, otp, password }
exports.resetPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp, password } = req.body;
  if (!emailOrPhone || !otp || !password) throw new ApiError(400, "All fields are required");
  if (String(password).length < 6) throw new ApiError(400, "Password must be at least 6 characters");

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: emailOrPhone.trim() }] }).select(
    "+resetOtpHash +resetOtpExpires"
  );

  if (!user || !user.resetOtpHash || !user.resetOtpExpires) throw new ApiError(400, "Invalid or expired reset code");
  if (user.resetOtpExpires.getTime() < Date.now()) throw new ApiError(400, "Reset code has expired. Please request a new one.");
  if (!(await bcrypt.compare(String(otp).trim(), user.resetOtpHash))) throw new ApiError(400, "Invalid reset code");

  user.password = password;          // virtual setter re-hashes on save
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  await user.save();
  await audit(user, "password_reset", "user", user._id);

  res.json({ success: true, token: signToken(user), user: serializeUser(user) });
});

// Statuses an agent's task can be in and still be considered "active" / unfinished.
const TERMINAL_STATUSES = ["completed", "delivered", "rejected", "cancelled"];

// DELETE /api/account  — the signed-in user permanently deletes their OWN account.
// Customers: their requests, payments, uploaded files and notifications are removed.
// Agents: blocked while they still have active assigned tasks (admin must reassign first).
exports.deleteMyAccount = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts cannot be self-deleted. Ask another admin to remove this account.");
  }

  if (user.role === "agent") {
    const active = await ServiceRequest.exists({
      assignedAgent: user._id,
      status: { $nin: TERMINAL_STATUSES },
    });
    if (active) {
      throw new ApiError(400, "You still have active assigned tasks. Please ask an admin to reassign them before deleting your account.");
    }
    await AgentProfile.deleteOne({ user: user._id });
  }

  if (user.role === "customer") {
    const requests = await ServiceRequest.find({ customer: user._id }).select("documents deliverables");
    for (const r of requests) {
      for (const file of [...(r.documents || []), ...(r.deliverables || [])]) {
        await removeStoredFile(file); // best-effort; never throws
      }
    }
    await ServiceRequest.deleteMany({ customer: user._id });
    await Payment.deleteMany({ customer: user._id });
    await CustomerProfile.deleteOne({ user: user._id });
  }

  await Notification.deleteMany({ user: user._id });
  await audit(user, "account_deleted", "user", user._id, { email: user.email, role: user.role });
  await user.deleteOne();

  res.json({ success: true, message: "Your account and associated data have been deleted." });
});
