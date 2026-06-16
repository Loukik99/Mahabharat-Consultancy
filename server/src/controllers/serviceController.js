const { Service, ServiceCategory } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeService, serializeCategory } = require("../utils/serializers");
const { audit } = require("../utils/helpers");

// GET /api/services/categories
exports.listCategories = asyncHandler(async (_req, res) => {
  const cats = await ServiceCategory.find({ isActive: true }).sort({ order: 1 });
  res.json({ success: true, categories: cats.map(serializeCategory) });
});

// GET /api/services?category=&search=&all=
exports.list = asyncHandler(async (req, res) => {
  const q = {};
  if (!req.query.all) q.isActive = true;
  if (req.query.category && req.query.category !== "all") q.category = req.query.category;
  if (req.query.search) {
    const rx = new RegExp(req.query.search, "i");
    q.$or = [{ name: rx }, { description: rx }];
  }
  const list = await Service.find(q).sort({ name: 1 });
  res.json({ success: true, services: list.map(serializeService) });
});

// GET /api/services/:id
exports.get = asyncHandler(async (req, res) => {
  const s = await Service.findById(req.params.id);
  if (!s) throw new ApiError(404, "Service not found");
  res.json({ success: true, service: serializeService(s) });
});

// POST /api/services  (admin)
exports.create = asyncHandler(async (req, res) => {
  const { name, category } = req.body;
  if (!name || !category) throw new ApiError(400, "Name and category are required");
  const slug = (req.body.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const s = await Service.create({ ...req.body, slug });
  await audit(req.user, "service_created", "service", s._id, s.name);
  res.status(201).json({ success: true, service: serializeService(s) });
});

// PATCH /api/services/:id  (admin)
exports.update = asyncHandler(async (req, res) => {
  const s = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!s) throw new ApiError(404, "Service not found");
  await audit(req.user, "service_updated", "service", s._id, s.name);
  res.json({ success: true, service: serializeService(s) });
});

module.exports.toggle = asyncHandler(async (req, res) => {
  const s = await Service.findByIdAndUpdate(req.params.id, { isActive: !!req.body.isActive }, { new: true });
  if (!s) throw new ApiError(404, "Service not found");
  res.json({ success: true, service: serializeService(s) });
});
