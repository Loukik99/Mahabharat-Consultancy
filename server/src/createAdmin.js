/* Create (or update) a real admin account — safe to run against the live DB.
 *
 * Unlike `npm run seed`, this does NOT wipe any data. It reads the owner's
 * details from environment variables so no real name / email / password is
 * ever hardcoded into the repo.
 *
 * Usage (PowerShell):
 *   cd server
 *   $env:ADMIN_NAME="Owner Full Name"; $env:ADMIN_EMAIL="owner@example.com"; `
 *   $env:ADMIN_PHONE="9XXXXXXXXX"; $env:ADMIN_PASSWORD="a-strong-password"; `
 *   npm run create-admin
 */
require("dotenv").config();
const { connectDB, disconnectDB } = require("./config/db");
const { User } = require("./models");
const { validatePassword } = require("./utils/passwordPolicy");

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const phone = (process.env.ADMIN_PHONE || "").trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !phone || !password) {
    console.error(
      "❌ Missing values. Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD."
    );
    process.exit(1);
  }
  try {
    validatePassword(password, { label: "ADMIN_PASSWORD" });
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  if (user) {
    user.name = name;
    user.phone = phone;
    user.role = "admin";
    user.isActive = true;
    user.password = password; // re-hashed; also bumps tokenVersion
    await user.save();
    console.log(`✅ Updated existing account → admin: ${email}`);
  } else {
    user = new User({ name, email, phone, role: "admin", isActive: true });
    user.password = password;
    await user.save();
    console.log(`✅ Created new admin: ${email}`);
  }

  await disconnectDB();
  console.log("Done. You can now sign in with this email + password.");
}

main().catch(async (e) => {
  console.error("❌ Failed:", e.message);
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
