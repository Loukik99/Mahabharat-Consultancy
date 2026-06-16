const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amountLabel: { type: String, default: "Price on request" },
    method: { type: String, enum: ["upi", "cash", "other"], default: "upi" },
    status: { type: String, enum: ["pending", "received"], default: "pending", index: true },
    markedReceivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
