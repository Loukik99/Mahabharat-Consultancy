const { User, AgentProfile, ServiceRequest } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeUser } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const { validatePassword } = require("../utils/passwordPolicy");
const { pick } = require("../utils/sanitize");

exports.listCustomers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "customer" }).sort({ createdAt: -1 });
  res.json({ success: true, customers: users.map((u) => serializeUser(u, "admin")) });
});

exports.listAgents = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "agent" }).sort({ createdAt: -1 });
  res.json({ success: true, agents: users.map((u) => serializeUser(u, "admin")) });
});

exports.createAgent = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) throw new ApiError(400, "All fields are required");
  validatePassword(password);
  const emailNorm = String(email).toLowerCase().trim();
  const phoneNorm = String(phone).trim();
  if (await User.findOne({ $or: [{ email: emailNorm }, { phone: phoneNorm }] })) {
    throw new ApiError(409, "Email or mobile already in use");
  }
  const agent = new User({
    name: String(name).trim(),
    email: emailNorm,
    phone: phoneNorm,
    role: "agent",
  });
  agent.password = password;
  await agent.save();
  await AgentProfile.create({ user: agent._id });
  await audit(req.user, "agent_created", "user", agent._id, name);
  res.status(201).json({ success: true, agent: serializeUser(agent, "admin") });
});

exports.update = asyncHandler(async (req, res) => {
  // Never allow role / password / email mass-assignment through this endpoint.
  const allowed = pick(req.body, ["name", "phone", "address", "isActive"]);
  if (allowed.phone) allowed.phone = String(allowed.phone).trim();
  if (allowed.name) allowed.name = String(allowed.name).trim();
  const u = await User.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
  if (!u) throw new ApiError(404, "User not found");
  await audit(req.user, "user_updated", "user", u._id);
  res.json({ success: true, user: serializeUser(u, "admin") });
});

exports.setActive = asyncHandler(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { isActive: !!req.body.isActive }, { new: true });
  if (!u) throw new ApiError(404, "User not found");
  // Force re-login when deactivated by bumping tokenVersion.
  if (!req.body.isActive) {
    u.tokenVersion = (u.tokenVersion || 0) + 1;
    await u.save();
  }
  await audit(req.user, req.body.isActive ? "user_activated" : "user_deactivated", "user", u._id);
  res.json({ success: true, user: serializeUser(u, "admin") });
});

exports.remove = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, "User not found");
  if (u.role === "admin") throw new ApiError(400, "Cannot delete an admin account");
  if (
    u.role === "agent" &&
    (await ServiceRequest.exists({
      assignedAgent: u._id,
      status: { $nin: ["delivered", "rejected", "cancelled"] },
    }))
  ) {
    throw new ApiError(400, "Agent has active tasks — reassign them first");
  }
  await u.deleteOne();
  if (u.role === "agent") await AgentProfile.deleteOne({ user: u._id });
  await audit(req.user, "user_deleted", "user", u._id, u.name);
  res.json({ success: true });
});
