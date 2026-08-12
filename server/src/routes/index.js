const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { asyncHandler } = require("../utils/apiError");
const {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
  uploadLimiter,
  requestCreateLimiter,
} = require("../middleware/rateLimits");

const auth = require("../controllers/authController");
const services = require("../controllers/serviceController");
const requests = require("../controllers/requestController");
const payments = require("../controllers/paymentController");
const users = require("../controllers/userController");
const misc = require("../controllers/miscController");
const govtJobs = require("../data/govtJobs");

router.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── Auth ──────────────────────────────────────────────────────────
router.post("/auth/register", registerLimiter, auth.register);
router.post("/auth/login", loginLimiter, auth.login);
router.post("/auth/forgot-password", forgotLimiter, auth.forgotPassword);
router.post("/auth/reset-password", resetLimiter, auth.resetPassword);
router.post("/auth/logout", requireAuth, auth.logout);
router.get("/auth/me", requireAuth, auth.me);
router.delete("/account", requireAuth, auth.deleteMyAccount);

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
  if (req.query.sector && req.query.sector !== "all") {
    list = list.filter((j) => j.sector === req.query.sector);
  }
  if (req.query.search) {
    const q = String(req.query.search).toLowerCase().slice(0, 80);
    list = list.filter(
      (j) => j.title.toLowerCase().includes(q) || j.organization.toLowerCase().includes(q)
    );
  }
  res.json({ success: true, jobs: list });
});

// ── Requests ──────────────────────────────────────────────────────
router.use("/requests", requireAuth);
router.get("/requests", requests.list);
router.post("/requests", requireRole("customer"), requestCreateLimiter, requests.create);
router.get("/requests/:id", requests.get);
router.patch("/requests/:id", requests.update);
router.patch("/requests/:id/status", requests.setStatus);
router.patch("/requests/:id/assign", requireRole("admin"), requests.assignAgent);
router.patch("/requests/:id/ready", requireRole("agent", "admin"), requests.markReadyForPayment);
router.post("/requests/:id/comments", requests.addComment);

router.post(
  "/requests/:id/documents",
  uploadLimiter,
  upload.single("file"),
  requests.uploadDocument
);
router.delete("/requests/:id/documents/:docId", requests.removeDocument);
router.get("/requests/:id/documents/:docId/download", requests.downloadDocument);

router.post(
  "/requests/:id/deliverables",
  requireRole("agent", "admin"),
  uploadLimiter,
  upload.single("file"),
  requests.uploadDeliverable
);
router.get("/requests/:id/deliverables/:delId/download", requests.downloadDeliverable);

router.post("/requests/:id/pay", requireRole("customer"), payments.record);
router.patch("/requests/:id/payment/received", requireRole("admin"), payments.markReceived);

router.post("/requests/:id/call-requests", requireRole("agent", "admin"), misc.requestCall);
router.get("/requests/:id/calls", misc.listCalls);
router.patch("/requests/:id/calls/:callId/complete", requireRole("agent", "admin"), misc.completeCall);

router.get("/payments", requireAuth, requireRole("admin"), payments.list);

router.use("/users", requireAuth, requireRole("admin"));
router.get("/users/customers", users.listCustomers);
router.get("/users/agents", users.listAgents);
router.post("/users/agents", users.createAgent);
router.patch("/users/:id/active", users.setActive);
router.patch("/users/:id", users.update);
router.delete("/users/:id", users.remove);

router.get("/stats/admin", requireAuth, requireRole("admin"), misc.adminStats);
router.get("/stats/agents", requireAuth, requireRole("admin"), misc.agentPerformance);
router.get("/audit", requireAuth, requireRole("admin"), misc.listAudit);

router.get("/call-requests", requireAuth, requireRole("admin"), misc.listCallRequests);
router.patch("/call-requests/:callId", requireAuth, requireRole("admin"), misc.decideCallRequest);

router.get("/notifications", requireAuth, misc.listNotifications);
router.patch("/notifications/read-all", requireAuth, misc.markAllNotificationsRead);
router.patch("/notifications/:id/read", requireAuth, misc.markNotificationRead);

module.exports = router;
void asyncHandler;
