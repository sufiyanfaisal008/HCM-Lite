import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import * as c from "./controllers.js";
import * as ai from "./ai.js";
import { auth, roles, validate, wrap, fail } from "./middleware.js";
import { validDate } from "./services.js";

const router = express.Router();

const text = z.string().trim().min(1);
const email = z.string().trim().email().transform(v => v.toLowerCase());
const password = z.string().min(10).max(128);
const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const date = z.string().refine(validDate, "Expected a valid YYYY-MM-DD date.");
const instant = z.string().datetime({ offset: true });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: req => String(req.user._id),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "AI hourly limit reached. Use the normal forms." }
});

const employeeCreate = z.object({
  code: text.max(30),
  name: text.max(100),
  email,
  department: id,
  designation: id,
  joinDate: date,
  exitDate: date.nullable().optional(),
  status: z.enum(["active", "probation", "exited"]).default("active"),
  gender: z.string().max(30).default("unspecified"),
  phone: z.string().max(30).default(""),
  address: z.string().max(500).default(""),
  basic: z.coerce.number().positive().max(100000000)
}).strict();

const employeeUpdate = employeeCreate.omit({ email: true, code: true }).partial();

const settings = z.object({
  name: text.max(150),
  timezone: text.max(80),
  officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  graceMinutes: z.coerce.number().int().min(0).max(180),
  halfDayHours: z.coerce.number().min(1).max(12),
  weekends: z.array(z.number().int().min(0).max(6)).max(6)
    .refine(values => new Set(values).size === values.length),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(10000)
}).strict();

const resourceSchemas = {
  departments: z.object({ name: text.max(100) }).strict(),
  designations: z.object({ name: text.max(100) }).strict(),
  holidays: z.object({ name: text.max(100), date }).strict(),
  "leave-types": z.object({
    name: text.max(50).transform(v => v.toLowerCase()),
    quota: z.coerce.number().int().min(0).max(366),
    unpaid: z.boolean()
  }).strict()
};

const resourceValidation = (req, res, next) => {
  const schema = resourceSchemas[req.params.kind];
  if (!schema) return next(new Error("Unknown resource."));
  return validate(schema)(req, res, next);
};

const review = z.object({
  status: z.enum(["approved", "rejected"]),
  comment: text.max(1000)
}).strict();

const filters = z.object({
  start: date.optional(),
  end: date.optional(),
  department: id.optional()
}).strict();

router.get("/setup/status", wrap(c.setupStatus));
router.post("/setup", setupLimiter, validate(z.object({
  companyName: text.max(150),
  email,
  password
}).strict()), wrap(c.setup));

router.post("/auth/login", loginLimiter, validate(z.object({
  email, password: z.string().min(1).max(128)
}).strict()), wrap(c.login));

router.use(auth);

router.get("/auth/me", wrap(c.me));
router.post("/auth/logout", wrap(c.logout));
router.post("/auth/password", validate(z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password
}).strict()), wrap(c.changePassword));

router.get("/settings", roles("admin", "hr"), wrap(c.getSettings));
router.put("/settings", roles("admin"), validate(settings), wrap(c.updateSettings));

router.get("/organization/:kind", (req, res, next) => {
  if (!resourceSchemas[req.params.kind]) return fail(404, "Unknown resource.");
  if (
    req.user.role === "employee" &&
    !["leave-types", "holidays"].includes(req.params.kind)
  ) return fail(403, "No access.");
  next();
}, wrap(c.resources));

router.post("/organization/:kind",
  roles("admin"), resourceValidation, wrap(c.saveResource));
router.put("/organization/:kind/:id",
  roles("admin"), resourceValidation, wrap(c.saveResource));

router.get("/users", roles("admin"), wrap(c.users));
router.post("/users/hr", roles("admin"),
  validate(z.object({ email }).strict()), wrap(c.createHR));
router.patch("/users/:id", roles("admin"), validate(z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }).strict(),
  z.object({
    action: z.literal("active"), active: z.boolean()
  }).strict()
])), wrap(c.manageUser));

router.get("/employees/export", roles("hr"), wrap(c.exportEmployees));
router.post("/employees/import", roles("hr"), validate(z.object({
  csv: z.string().min(1).max(1500000),
  dryRun: z.boolean().default(true)
}).strict()), wrap(c.importEmployees));
router.get("/employees", wrap(c.employeeList));
router.post("/employees", roles("hr"),
  validate(employeeCreate), wrap(c.createEmployee));
router.get("/employees/:id", wrap(c.employeeDetail));
router.patch("/employees/:id", (req, res, next) => {
  if (req.user.role === "admin") return fail(403, "HR manages employee records.");
  const schema = req.user.role === "employee"
    ? z.object({
      phone: z.string().max(30).optional(),
      address: z.string().max(500).optional()
    }).strict()
    : employeeUpdate;
  return validate(schema)(req, res, next);
}, wrap(c.updateEmployee));

router.get("/attendance", wrap(c.attendance));
router.post("/attendance/check-in",
  roles("employee", "hr"), wrap(c.checkIn));
router.post("/attendance/check-out",
  roles("employee", "hr"), wrap(c.checkOut));

router.get("/corrections", wrap(c.corrections));
router.post("/corrections", roles("employee"), validate(z.object({
  date,
  checkIn: instant,
  checkOut: instant,
  reason: text.max(1000)
}).strict()), wrap(c.requestCorrection));
router.patch("/corrections/:id/review",
  roles("hr"), validate(review), wrap(c.reviewCorrection));

router.get("/leave/balance", wrap(c.balances));
router.get("/leave", wrap(c.leaves));
router.post("/leave", roles("hr", "employee"), validate(z.object({
  type: id,
  start: date,
  end: date,
  reason: text.max(1000)
}).strict()), wrap(c.applyLeave));
router.patch("/leave/:id/cancel",
  roles("hr", "employee"), wrap(c.cancelLeave));
router.patch("/leave/:id/review",
  roles("hr"), validate(review), wrap(c.reviewLeave));

router.get("/payroll", wrap(c.payrollList));
router.post("/payroll", roles("hr"), validate(z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
}).strict()), wrap(c.createPayroll));
router.patch("/payroll/:id/finalize",
  roles("admin"), wrap(c.finalizePayroll));
router.get("/payroll/:id/payslip/:employeeId", wrap(c.payslip));

router.get("/analytics", wrap(c.analytics));

router.post("/ai/chat", aiLimiter, validate(z.object({
  message: text.max(2000)
}).strict()), wrap(ai.chat));
router.post("/ai/summary", roles("admin", "hr"), aiLimiter,
  validate(filters), wrap(ai.summarize));
router.post("/ai/smart-leave", roles("hr", "employee"), aiLimiter,
  validate(z.object({ message: text.max(2000) }).strict()),
  wrap(ai.smartLeave));

router.get("/announcements", wrap(c.announcements));
router.post("/announcements", roles("admin", "hr"), validate(z.object({
  title: text.max(150), body: text.max(3000)
}).strict()), wrap(c.postAnnouncement));

router.get("/notifications", wrap(c.notifications));
router.patch("/notifications/:id/read", wrap(c.readNotification));
router.get("/audit", roles("admin"), wrap(c.auditLogs));

export default router;
