import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { User } from "./models.js";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const fail = (status, message, details) => {
  throw new HttpError(status, message, details);
};

export const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const validate = schema => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

export const auth = wrap(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) fail(401, "Login required.");

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });
  } catch {
    fail(401, "Session expired. Please login again.");
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.active || user.tokenVersion !== payload.v) {
    fail(401, "Session is no longer valid.");
  }

  req.user = user;

  if (
    user.mustChangePassword &&
    !["/auth/me", "/auth/password", "/auth/logout"].includes(req.path)
  ) {
    fail(403, "Change your temporary password first.");
  }
  next();
});

export const roles = (...allowed) => (req, res, next) => {
  if (!allowed.includes(req.user.role)) {
    return next(new HttpError(403, "You do not have permission."));
  }
  next();
};

export function ownEmployee(user) {
  if (!user.employeeId) fail(422, "This account has no employee profile.");
  return user.employeeId;
}

export function scopeEmployee(user, requested) {
  if (user.role === "employee") {
    const own = ownEmployee(user);
    if (requested && String(requested) !== String(own)) {
      fail(403, "You can only access your own records.");
    }
    return own;
  }
  return requested || null;
}

export function objectId(value) {
  if (!mongoose.isValidObjectId(value)) fail(422, "Invalid record identifier.");
  return new mongoose.Types.ObjectId(value);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    return res.status(422).json({
      message: "Validation failed.",
      details: error.flatten()
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      message: "A record with this unique value already exists."
    });
  }

  if (error.name === "CastError" || error.name === "ValidationError") {
    return res.status(422).json({ message: error.message });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request is too large." });
  }

  if (!error.status) console.error(error);
  res.status(error.status || 500).json({
    message: error.status ? error.message : "Unexpected server error.",
    ...(error.details ? { details: error.details } : {})
  });
}
