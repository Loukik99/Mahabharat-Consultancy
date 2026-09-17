const crypto = require("crypto");
const { User, CustomerProfile, AgentProfile, ServiceRequest, Payment, Notification } = require("../models");
const { signToken, setAuthCookie, clearAuthCookie, setCsrfCookie } = require("../middleware/auth");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeUser } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const { removeStoredFile } = require("../utils/storage");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/mailer");
const { validatePassword } = require("../utils/passwordPolicy");
const bcrypt = require("bcryptjs");

/** Establish session via HttpOnly cookie only — never put JWT in JSON (XSS). */
function issueAuth(res, user) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return token;
}

// POST /api/auth/register  (customers only)
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) throw new ApiError(400, "All fields are required");
  validatePassword(password);

  const emailNorm = String(email).toLowerCase().trim();
  const phoneNorm = String(phone).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) throw new ApiError(400, "Invalid email");
  if (!/^\d{10}$/.test(phoneNorm)) throw new ApiError(400, "Phone must be a 10-digit number");

  const exists = await User.findOne({ $or: [{ email: emailNorm }, { phone: phoneNorm }] });
  if (exists) throw new ApiError(409, "Email or mobile number already registered");

  const user = new User({ name: String(name).trim(), email: emailNorm, phone: phoneNorm, role: "customer" });
  user.password = password;
  await user.save();
  await CustomerProfile.create({ user: user._id });
  await audit(user, "register", "user", user._id);

  try {
    await sendWelcomeEmail(user);
  } catch (e) {
    console.error("[mail] welcome email failed:", e.message);
  }

  issueAuth(res, user);
  res.status(201).json({ success: true, user: serializeUser(user) });
});

// POST /api/auth/login  (email OR phone + password)
exports.login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;
  if (!emailOrPhone || !password) throw new ApiError(400, "Credentials required");

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: String(emailOrPhone).trim() }] }).select(
    "+passwordHash +failedLoginAttempts +lockUntil"
  );

  // Generic error — do not reveal whether the account exists.
  const fail = async (u) => {
    if (u) {
      try {
        await u.registerFailedLogin();
        await audit(u, "login_failed", "user", u._id);
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(401, "Invalid credentials");
  };

  if (!user) await fail(null);
  if (user.isLocked()) {
    await audit(user, "login_locked", "user", user._id);
    throw new ApiError(429, "Account temporarily locked due to too many failed attempts. Try again later.");
  }
  if (!(await user.comparePassword(password))) await fail(user);
  if (!user.isActive) throw new ApiError(403, "Your account has been deactivated");

  await user.clearLoginFailures();
  const action = user.role === "admin" ? "admin_login" : user.role === "agent" ? "staff_login" : "login";
  await audit(user, action, "user", user._id);
  issueAuth(res, user);
  res.json({ success: true, user: serializeUser(user) });
});

// POST /api/auth/logout — invalidate all sessions for this account
exports.logout = asyncHandler(async (req, res) => {
  if (req.user) {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save();
    await audit(req.user, "logout", "user", req.user._id);
  }
  clearAuthCookie(res);
  res.json({ success: true, message: "Signed out" });
});

// GET /api/auth/me — refresh CSRF cookie for restored sessions
exports.me = asyncHandler(async (req, res) => {
  setCsrfCookie(res);
  res.json({ success: true, user: serializeUser(req.user) });
});

const RESET_SENT_MSG = "If an account matches, a reset code has been sent to its email.";
const MAX_OTP_ATTEMPTS = 5;

// POST /api/auth/forgot-password  { emailOrPhone }
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone) throw new ApiError(400, "Email or mobile number is required");

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: String(emailOrPhone).trim() }] });

  if (user && user.isActive) {
    const otp = String(crypto.randomInt(100000, 1000000));
    user.resetOtpHash = await bcrypt.hash(otp, 10);
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.resetOtpAttempts = 0;
    await user.save();
    await audit(user, "password_reset_requested", "user", user._id);
    try {
      await sendPasswordResetEmail(user, otp);
    } catch (e) {
      console.error("[mail] password-reset email failed:", e.message);
    }
  }

  res.json({ success: true, message: RESET_SENT_MSG });
});

// POST /api/auth/reset-password  { emailOrPhone, otp, password }
exports.resetPassword = asyncHandler(async (req, res) => {
  const { emailOrPhone, otp, password } = req.body;
  if (!emailOrPhone || !otp || !password) throw new ApiError(400, "All fields are required");
  validatePassword(password);

  const id = String(emailOrPhone).trim().toLowerCase();
  const user = await User.findOne({ $or: [{ email: id }, { phone: String(emailOrPhone).trim() }] }).select(
    "+resetOtpHash +resetOtpExpires +resetOtpAttempts"
  );

  if (!user || !user.resetOtpHash || !user.resetOtpExpires) {
    throw new ApiError(400, "Invalid or expired reset code");
  }
  if (user.resetOtpExpires.getTime() < Date.now()) {
    throw new ApiError(400, "Reset code has expired. Please request a new one.");
  }
  if ((user.resetOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
    user.resetOtpHash = undefined;
    user.resetOtpExpires = undefined;
    user.resetOtpAttempts = 0;
    await user.save();
    throw new ApiError(429, "Too many invalid codes. Please request a new reset code.");
  }

  const ok = await bcrypt.compare(String(otp).trim(), user.resetOtpHash);
  if (!ok) {
    user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
    await user.save();
    throw new ApiError(400, "Invalid reset code");
  }

  // Virtual setter increments tokenVersion → all prior JWTs die.
  user.password = password;
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
  await user.save();
  await audit(user, "password_reset", "user", user._id);

  // Do not auto-login after reset — force a fresh login.
  clearAuthCookie(res);
  res.json({ success: true, message: "Password updated. Please sign in with your new password." });
});

const TERMINAL_STATUSES = ["completed", "delivered", "rejected", "cancelled"];

// DELETE /api/account
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
        await removeStoredFile(file);
      }
    }
    await ServiceRequest.deleteMany({ customer: user._id });
    await Payment.deleteMany({ customer: user._id });
    await CustomerProfile.deleteOne({ user: user._id });
  }

  await Notification.deleteMany({ user: user._id });
  await audit(user, "account_deleted", "user", user._id, { email: user.email, role: user.role });
  await user.deleteOne();
  clearAuthCookie(res);

  res.json({ success: true, message: "Your account and associated data have been deleted." });
});
