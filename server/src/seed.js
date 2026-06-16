/* Seed the database with demo users, the service catalog and a few sample
 * requests so every dashboard has data to show.
 *
 * Usage:  npm run seed
 * Works against MONGODB_URI if set, otherwise an in-memory DB (dev only — its
 * data does not persist, so seeding in-memory is mainly for verification).
 */
const { connectDB, disconnectDB } = require("./config/db");
const {
  User, CustomerProfile, AgentProfile, ServiceCategory, Service,
  ServiceRequest, Payment, Notification, AuditLog,
} = require("./models");
const { categories, services } = require("./data/catalog");

// Populates the database. Assumes an active mongoose connection.
async function seedDatabase() {
  await Promise.all([
    User.deleteMany({}), CustomerProfile.deleteMany({}), AgentProfile.deleteMany({}),
    ServiceCategory.deleteMany({}), Service.deleteMany({}), ServiceRequest.deleteMany({}),
    Payment.deleteMany({}), Notification.deleteMany({}), AuditLog.deleteMany({}),
  ]);

  // Categories + services
  await ServiceCategory.insertMany(categories);
  const svcDocs = await Service.insertMany(services);
  const svc = Object.fromEntries(svcDocs.map((s) => [s.slug, s]));

  // Users (passwords hashed via the model's virtual setter)
  const mkUser = async (data) => { const u = new User(data); u.password = data.password; await u.save(); return u; };
  const admin = await mkUser({ name: "Owner Admin", email: "admin@mahabharat.com", phone: "9999999999", password: "admin123", role: "admin" });
  const agent1 = await mkUser({ name: "Rajesh Kumar", email: "rajesh@mahabharat.com", phone: "9888888888", password: "agent123", role: "agent" });
  const agent2 = await mkUser({ name: "Priya Sharma", email: "priya@mahabharat.com", phone: "9777777777", password: "agent123", role: "agent" });
  const cust1 = await mkUser({ name: "Amit Patel", email: "amit@example.com", phone: "9666666666", password: "customer123", role: "customer", address: { street: "123 MG Road", city: "Belagavi", state: "Karnataka", pincode: "590001" } });
  const cust2 = await mkUser({ name: "Sunita Devi", email: "sunita@example.com", phone: "9555555555", password: "customer123", role: "customer", address: { street: "45 Station Road", city: "Belagavi", state: "Karnataka", pincode: "590006" } });

  await AgentProfile.insertMany([{ user: agent1._id }, { user: agent2._id }]);
  await CustomerProfile.insertMany([{ user: cust1._id }, { user: cust2._id }]);

  // Sample requests across the workflow
  let n = 1000;
  const num = () => `MC-${++n}`;
  const mk = (data) => ServiceRequest.create({ requestNumber: num(), priceLabel: "Price on request", ...data });

  await mk({ customer: cust1._id, service: svc["pan-card"]._id, category: "govt_docs", status: "submitted", notes: "Need a fresh PAN card.", statusHistory: [{ status: "submitted", by: cust1._id, byRole: "customer" }] });
  await mk({ customer: cust1._id, service: svc["passport"]._id, category: "govt_docs", status: "documents_required", assignedAgent: agent1._id, notes: "Fresh passport.", comments: [{ by: agent1._id, byRole: "agent", message: "Please upload a clear birth certificate." }], statusHistory: [{ status: "submitted", by: cust1._id, byRole: "customer" }, { status: "documents_required", by: agent1._id, byRole: "agent", note: "Birth certificate missing" }] });
  await mk({ customer: cust1._id, service: svc["gst-registration"]._id, category: "tax_gst", status: "in_progress", assignedAgent: agent2._id, notes: "New shop registration.", statusHistory: [{ status: "submitted", by: cust1._id, byRole: "customer" }, { status: "in_progress", by: agent2._id, byRole: "agent" }] });

  const waiting = await mk({ customer: cust1._id, service: svc["itr-filing"]._id, category: "tax_gst", status: "waiting_payment", assignedAgent: agent2._id, notes: "Salaried ITR.", deliverables: [{ fileName: "ITR-Acknowledgement.pdf", storedName: "", uploadedByAgent: agent2._id }], statusHistory: [{ status: "submitted", by: cust1._id, byRole: "customer" }, { status: "completed", by: agent2._id, byRole: "agent" }, { status: "waiting_payment", by: agent2._id, byRole: "agent" }] });

  const delivered = await mk({ customer: cust2._id, service: svc["scholarship-forms"]._id, category: "exams_jobs", status: "delivered", assignedAgent: agent1._id, isPaid: true, paymentApprovedByAdmin: true, notes: "Post-matric scholarship.", deliverables: [{ fileName: "Scholarship-Form-Filled.pdf", storedName: "", uploadedByAgent: agent1._id }], statusHistory: [{ status: "submitted", by: cust2._id, byRole: "customer" }, { status: "completed", by: agent1._id, byRole: "agent" }, { status: "delivered", by: admin._id, byRole: "admin" }] });

  const pay = await Payment.create({ request: delivered._id, customer: cust2._id, amountLabel: "Price on request", method: "cash", status: "received", markedReceivedBy: admin._id });
  delivered.payment = pay._id; await delivered.save();

  await Notification.insertMany([
    { user: cust1._id, message: "Agent requested a birth certificate for your Passport request.", type: "action", link: "#/requests/" + waiting._id },
    { user: cust1._id, message: "Your ITR Filing is ready. Please complete payment.", type: "warning" },
  ]);
  await AuditLog.create({ actor: admin._id, actorRole: "admin", action: "payment_received", targetType: "request", targetId: String(delivered._id), meta: "seed" });

  console.log("✅ Seed complete");
  console.log("   Admin    : admin@mahabharat.com / admin123");
  console.log("   Agent    : rajesh@mahabharat.com / agent123");
  console.log("   Customer : amit@example.com / customer123");
  console.log(`   ${svcDocs.length} services, ${categories.length} categories, 5 sample requests`);
}

// CLI runner: connect, seed, disconnect.
async function run() {
  await connectDB();
  await seedDatabase();
  await disconnectDB();
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
}

module.exports = { seedDatabase };
