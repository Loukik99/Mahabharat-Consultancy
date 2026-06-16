const mongoose = require("mongoose");

const officialLinkSchema = new mongoose.Schema(
  { label: String, url: String, note: String },
  { _id: false }
);

const serviceCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "govt_docs"
    name: { type: String, required: true },
    nameHi: String,
    description: String,
    icon: String,
    accent: String,
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    category: { type: String, required: true, index: true }, // category key
    priceLabel: { type: String, default: "Price on request" },
    requiredDocuments: [String],
    officialLinks: [officialLinkSchema],
    processingTime: String,
    popular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = {
  ServiceCategory: mongoose.model("ServiceCategory", serviceCategorySchema),
  Service: mongoose.model("Service", serviceSchema),
};
