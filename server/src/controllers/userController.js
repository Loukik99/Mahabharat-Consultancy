const { User, AgentProfile, ServiceRequest } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeUser } = require("../utils/serializers");
const { audit } = require("../utils/helpers");

// GET /api/users/customers  (admin)
exports.listCustomers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "customer" }).sort({ createdAt: -1 });
  res.json({ success: true, customers: users.map((u) => serializeUser(u, "admin")) });
});

// GET /api/users/agents  (admin)
exports.listAgents = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "agent" }).sort({ createdAt: -1 });
  res.json({ success: true, agents: users.map((u) => serializeUser(u, "admin")) });
});

// POST /api/users/agents  (admin)
exports.createAgent = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) throw new ApiError(400, "All fields are required");
  if (await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] })) {
    throw new ApiError(409, "Email or mobile already in use");
  }
  const agent = new User({ name, email, phone, role: "agent" });
  agent.password = password;
  await agent.save();
  await AgentProfile.create({ user: agent._id });
  await audit(req.user, "agent_created", "user", agent._id, name);
  res.status(201).json({ success: true, agent: serializeUser(agent, "admin") });
});

// PATCH /api/users/:id  (admin)
exports.update = asyncHandler(async (req, res) => {
  const allowed = (({ name, phone, address, isActive }) => ({ name, phone, address, isActive }))(req.body);
  const u = await User.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
  if (!u) throw new ApiError(404, "User not found");
  await audit(req.user, "user_updated", "user", u._id);
  res.json({ success: true, user: serializeUser(u, "admin") });
});

// PATCH /api/users/:id/active  (admin)
exports.setActive = asyncHandler(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { isActive: !!req.body.isActive }, { new: true });
  if (!u) throw new ApiError(404, "User not found");
  await audit(req.user, req.body.isActive ? "user_activated" : "user_deactivated", "user", u._id);
  res.json({ success: true, user: serializeUser(u, "admin") });
});

// DELETE /api/users/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, "User not found");
  if (u.role === "admin") throw new ApiError(400, "Cannot delete an admin account");
  if (u.role === "agent" && (await ServiceRequest.exists({ assignedAgent: u._id, status: { $nin: ["delivered", "rejected", "cancelled"] } }))) {
    throw new ApiError(400, "Agent has active tasks — reassign them first");
  }
  await u.deleteOne();
  if (u.role === "agent") await AgentProfile.deleteOne({ user: u._id });
  await audit(req.user, "user_deleted", "user", u._id, u.name);
  res.json({ success: true });
});
