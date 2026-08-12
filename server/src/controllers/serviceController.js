const mongoose = require("mongoose");
const { Service, ServiceCategory } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializeService, serializeCategory } = require("../utils/serializers");
const { audit } = require("../utils/helpers");
const { escapeRegex, pick } = require("../utils/sanitize");

const SERVICE_FIELDS = [
  "name",
  "slug",
  "description",
  "category",
  "priceLabel",
  "requiredDocuments",
  "officialLinks",
  "processingTime",
  "popular",
  "isActive",
];

exports.listCategories = asyncHandler(async (_req, res) => {
  const cats = await ServiceCategory.find({ isActive: true }).sort({ order: 1 });
  res.json({ success: true, categories: cats.map(serializeCategory) });
});

exports.list = asyncHandler(async (req, res) => {
  const q = {};
  if (!req.query.all) q.isActive = true;
  if (req.query.category && req.query.category !== "all") q.category = String(req.query.category).slice(0, 64);
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).slice(0, 80));
    const rx = new RegExp(term, "i");
    q.$or = [{ name: rx }, { description: rx }, { slug: rx }];
  }
  const list = await Service.find(q).sort({ name: 1 });
  res.json({ success: true, services: list.map(serializeService) });
});

exports.get = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const s = mongoose.isValidObjectId(id)
    ? await Service.findById(id)
    : await Service.findOne({ slug: String(id).slice(0, 120) });
  if (!s) throw new ApiError(404, "Service not found");
  res.json({ success: true, service: serializeService(s) });
});

exports.create = asyncHandler(async (req, res) => {
  const data = pick(req.body, SERVICE_FIELDS);
  if (!data.name || !data.category) throw new ApiError(400, "Name and category are required");
  data.slug = (data.slug || data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const s = await Service.create(data);
  await audit(req.user, "service_created", "service", s._id, s.name);
  res.status(201).json({ success: true, service: serializeService(s) });
});

exports.update = asyncHandler(async (req, res) => {
  const data = pick(req.body, SERVICE_FIELDS);
  if (data.slug) {
    data.slug = String(data.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  const s = await Service.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!s) throw new ApiError(404, "Service not found");
  await audit(req.user, "service_updated", "service", s._id, s.name);
  res.json({ success: true, service: serializeService(s) });
});

module.exports.toggle = asyncHandler(async (req, res) => {
  const s = await Service.findByIdAndUpdate(
    req.params.id,
    { isActive: !!req.body.isActive },
    { new: true }
  );
  if (!s) throw new ApiError(404, "Service not found");
  res.json({ success: true, service: serializeService(s) });
});
