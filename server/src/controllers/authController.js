const { User, CustomerProfile } = require("../models");
const { signToken } = require("../middleware/auth");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeUser } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const { sendWelcomeEmail } = require("../utils/mailer");

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
