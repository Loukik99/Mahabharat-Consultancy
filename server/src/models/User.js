const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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
  },
  { timestamps: true }
);

// Virtual setter so callers can assign `user.password = "..."` and it gets hashed on save.
userSchema.virtual("password").set(function (plain) {
  this._password = plain;
});

// Hash on validate (runs before save validation) so passwordHash is present.
userSchema.pre("validate", async function (next) {
  if (this._password) {
    this.passwordHash = await bcrypt.hash(this._password, 10);
    this._password = undefined;
  }
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Never leak the hash.
userSchema.set("toJSON", {
  virtuals: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
