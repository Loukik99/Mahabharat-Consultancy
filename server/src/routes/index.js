const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { asyncHandler } = require("../utils/apiError");

const auth = require("../controllers/authController");
const services = require("../controllers/serviceController");
const requests = require("../controllers/requestController");
const payments = require("../controllers/paymentController");
const users = require("../controllers/userController");
const misc = require("../controllers/miscController");
const govtJobs = require("../data/govtJobs");

// ── Health ────────────────────────────────────────────────────────
router.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── Auth ──────────────────────────────────────────────────────────
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.post("/auth/forgot-password", auth.forgotPassword); // emails a reset OTP
router.post("/auth/reset-password", auth.resetPassword);   // verifies OTP + sets new password
router.get("/auth/me", requireAuth, auth.me);
router.delete("/account", requireAuth, auth.deleteMyAccount); // self-service account deletion (customers & agents)

// ── Services (public read; admin write) ───────────────────────────
router.get("/services/categories", services.listCategories);
router.get("/services", services.list);
router.get("/services/:id", services.get);
router.post("/services", requireAuth, requireRole("admin"), services.create);
router.patch("/services/:id/toggle", requireAuth, requireRole("admin"), services.toggle);
router.patch("/services/:id", requireAuth, requireRole("admin"), services.update);

// ── Government jobs (public read) ─────────────────────────────────
router.get("/jobs", (req, res) => {
  let list = [...govtJobs];
  if (req.query.sector && req.query.sector !== "all") list = list.filter((j) => j.sector === req.query.sector);
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    list = list.filter((j) => j.title.toLowerCase().includes(q) || j.organization.toLowerCase().includes(q));
  }
  res.json({ success: true, jobs: list });
});

// ── Requests ──────────────────────────────────────────────────────
router.use("/requests", requireAuth);
router.get("/requests", requests.list);
router.post("/requests", requireRole("customer"), requests.create);
router.get("/requests/:id", requests.get);
router.patch("/requests/:id", requests.update);
router.patch("/requests/:id/status", requests.setStatus);
router.patch("/requests/:id/assign", requireRole("admin"), requests.assignAgent);
router.patch("/requests/:id/ready", requireRole("agent", "admin"), requests.markReadyForPayment);
router.post("/requests/:id/comments", requests.addComment);

// documents
router.post("/requests/:id/documents", upload.single("file"), requests.uploadDocument);
router.delete("/requests/:id/documents/:docId", requests.removeDocument);
router.get("/requests/:id/documents/:docId/download", requests.downloadDocument);

// deliverables (agent/admin upload; payment-gated download)
router.post("/requests/:id/deliverables", requireRole("agent", "admin"), upload.single("file"), requests.uploadDeliverable);
router.get("/requests/:id/deliverables/:delId/download", requests.downloadDeliverable);

// payments on a request
router.post("/requests/:id/pay", requireRole("customer"), payments.record);
router.patch("/requests/:id/payment/received", requireRole("admin"), payments.markReceived);

// call-permission workflow (agent requests → admin approves → agent calls)
router.post("/requests/:id/call-requests", requireRole("agent", "admin"), misc.requestCall);
router.get("/requests/:id/calls", misc.listCalls);
router.patch("/requests/:id/calls/:callId/complete", requireRole("agent", "admin"), misc.completeCall);

// ── Payments (admin list) ─────────────────────────────────────────
router.get("/payments", requireAuth, requireRole("admin"), payments.list);

// ── Users / agents (admin) ────────────────────────────────────────
router.use("/users", requireAuth, requireRole("admin"));
router.get("/users/customers", users.listCustomers);
router.get("/users/agents", users.listAgents);
router.post("/users/agents", users.createAgent);
router.patch("/users/:id/active", users.setActive);
router.patch("/users/:id", users.update);
router.delete("/users/:id", users.remove);

// ── Stats / audit (admin) ─────────────────────────────────────────
router.get("/stats/admin", requireAuth, requireRole("admin"), misc.adminStats);
router.get("/stats/agents", requireAuth, requireRole("admin"), misc.agentPerformance);
router.get("/audit", requireAuth, requireRole("admin"), misc.listAudit);

// Call-permission approvals (admin)
router.get("/call-requests", requireAuth, requireRole("admin"), misc.listCallRequests);
router.patch("/call-requests/:callId", requireAuth, requireRole("admin"), misc.decideCallRequest);

// ── Notifications (own) ───────────────────────────────────────────
router.get("/notifications", requireAuth, misc.listNotifications);
router.patch("/notifications/read-all", requireAuth, misc.markAllNotificationsRead);
router.patch("/notifications/:id/read", requireAuth, misc.markNotificationRead);

module.exports = router;

// silence unused import lint (asyncHandler available for future inline handlers)
void asyncHandler;
