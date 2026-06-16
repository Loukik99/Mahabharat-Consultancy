const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { User } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// Verifies the Bearer token and attaches req.user (without the password hash).
const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new ApiError(401, "Authentication required");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw new ApiError(401, "Account not found or deactivated");

  req.user = user;
  next();
});

// Role-based access control. Usage: requireRole("admin"), requireRole("admin", "agent")
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, "You do not have permission to perform this action"));
  }
  next();
};

module.exports = { signToken, requireAuth, requireRole };
