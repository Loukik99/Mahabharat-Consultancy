const mongoose = require("mongoose");

// Extra customer data, kept separate from the auth User record.
const customerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // References are stored masked / partial; full sensitive numbers are never persisted in plain text.
    aadhaarRef: String,
    panRef: String,
    notes: String,
  },
  { timestamps: true }
);

const agentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    specialties: [String],
    bio: String,
  },
  { timestamps: true }
);

module.exports = {
  CustomerProfile: mongoose.model("CustomerProfile", customerProfileSchema),
  AgentProfile: mongoose.model("AgentProfile", agentProfileSchema),
};
