const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

const addressSchema = new mongoose.Schema(
  {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["customer", "agent", "admin"], default: "customer", index: true },
    address: addressSchema,
    isActive: { type: Boolean, default: true },
    // Incremented on password change/reset — invalidates previously issued JWTs.
    tokenVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date },
    // Password-reset OTP (hashed) + expiry + attempt counter.
    resetOtpHash: { type: String, select: false },
    resetOtpExpires: { type: Date, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },
    // Login lockout (account-based abuse protection).
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.virtual("password").set(function (plain) {
  this._password = plain;
});

userSchema.pre("validate", async function (next) {
  if (this._password) {
    this.passwordHash = await bcrypt.hash(this._password, BCRYPT_ROUNDS);
    this._password = undefined;
    if (!this.isNew) {
      this.tokenVersion = (this.tokenVersion || 0) + 1;
      this.passwordChangedAt = new Date();
    }
  }
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isLocked = function () {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

/** Record a failed login; lock after 5 failures for 15 minutes. */
userSchema.methods.registerFailedLogin = async function () {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    this.failedLoginAttempts = 0;
  }
  await this.save();
};

userSchema.methods.clearLoginFailures = async function () {
  if (this.failedLoginAttempts || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    await this.save();
  }
};

userSchema.set("toJSON", {
  virtuals: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.resetOtpHash;
    delete ret.resetOtpExpires;
    delete ret.resetOtpAttempts;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
