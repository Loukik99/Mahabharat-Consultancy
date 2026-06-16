const { Payment, ServiceRequest } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { serializePayment } = require("../utils/serializers");
const { audit, notify } = require("../utils/helpers");

// GET /api/payments  (admin)
exports.list = asyncHandler(async (_req, res) => {
  const list = await Payment.find()
    .populate("request", "requestNumber")
    .populate("customer", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, payments: list.map(serializePayment) });
});

// POST /api/requests/:id/pay  (customer records they have paid; stays pending)
exports.record = asyncHandler(async (req, res) => {
  const r = await ServiceRequest.findById(req.params.id);
  if (!r) throw new ApiError(404, "Request not found");
  if (String(r.customer) !== req.user.id) throw new ApiError(403, "Not your request");

  let p = await Payment.findOne({ request: r._id });
  if (!p) {
    p = await Payment.create({
      request: r._id,
      customer: r.customer,
      amountLabel: r.priceLabel,
      method: req.body.method || "upi",
      status: "pending",
    });
    r.payment = p._id;
    await r.save();
  } else {
    p.method = req.body.method || p.method;
    await p.save();
  }
  await audit(req.user, "payment_recorded", "payment", p._id, r.requestNumber);
  res.status(201).json({ success: true, payment: serializePayment(p) });
});

// PATCH /api/requests/:id/payment/received  (ADMIN ONLY — unlocks downloads)
exports.markReceived = asyncHandler(async (req, res) => {
  const r = await ServiceRequest.findById(req.params.id);
  if (!r) throw new ApiError(404, "Request not found");

  let p = await Payment.findOne({ request: r._id });
  if (!p) {
    p = await Payment.create({ request: r._id, customer: r.customer, amountLabel: r.priceLabel, method: "cash" });
  }
  p.status = "received";
  p.markedReceivedBy = req.user.id;
  await p.save();

  r.payment = p._id;
  r.isPaid = true;
  r.paymentApprovedByAdmin = true;
  r.status = "delivered";
  r.statusHistory.push({ status: "delivered", by: req.user.id, byRole: "admin", note: "Payment verified" });
  await r.save();

  await audit(req.user, "payment_received", "request", r._id, `${r.requestNumber} marked paid`);
  await notify(r.customer, `Payment confirmed for ${r.requestNumber}. Your files are now available to download.`, "success", `#/requests/${r._id}`);
  res.json({ success: true, payment: serializePayment(p) });
});
