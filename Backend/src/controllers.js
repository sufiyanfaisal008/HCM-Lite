import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import { parse } from "csv-parse/sync";
import {
  User, Settings, Department, Designation, Holiday, LeaveType,
  Employee, Attendance, Correction, Leave, Payroll,
  Announcement, Notification, Audit
} from "./models.js";
import { fail, ownEmployee, scopeEmployee, objectId } from "./middleware.js";
import {
  audit, transaction, company, zonedParts, validDate,
  attendanceValues, assertUnlocked, employmentOn, workingDays,
  leaveBalances, createLeave, buildPayroll, dashboard,
  attendanceReport, notifyEmployee, monthBounds
} from "./services.js";

const publicUser = user => ({
  _id: user._id,
  email: user.email,
  role: user.role,
  employeeId: user.employeeId,
  active: user.active,
  mustChangePassword: user.mustChangePassword
});

const tokenFor = user => jwt.sign(
  { sub: String(user._id), v: user.tokenVersion },
  process.env.JWT_SECRET,
  { expiresIn: "8h", algorithm: "HS256" }
);

const tempPassword = () => crypto.randomBytes(12).toString("base64url");
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const paging = query => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 20))
});

export async function setupStatus(req, res) {
  res.json({ configured: Boolean(await Settings.exists({ _id: "company" })) });
}

export async function setup(req, res) {
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const admin = await transaction(async session => {
    if (await Settings.exists({ _id: "company" }).session(session)) {
      fail(409, "Setup is already complete.");
    }

    await Settings.create([{
      _id: "company",
      name: req.body.companyName,
      timezone: process.env.COMPANY_TIMEZONE || "Asia/Karachi"
    }], { session, ordered: true });

    const [user] = await User.create([{
      email: req.body.email,
      passwordHash,
      role: "admin"
    }], { session, ordered: true });

    await LeaveType.create([
      { name: "annual", quota: 14, unpaid: false },
      { name: "sick", quota: 8, unpaid: false },
      { name: "casual", quota: 10, unpaid: false },
      { name: "unpaid", quota: 0, unpaid: true }
    ], { session, ordered: true });

    await audit(user, "company.setup", "Settings", "company", null, {
      name: req.body.companyName
    }, session);
    return user;
  });
  res.status(201).json({ token: tokenFor(admin), user: publicUser(admin) });
}

export async function login(req, res) {
  const user = await User.findOne({
    email: req.body.email
  }).select("+passwordHash");

  if (!user || !user.active ||
      !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    fail(401, "Invalid email or password.");
  }
  res.json({ token: tokenFor(user), user: publicUser(user) });
}

export async function me(req, res) {
  res.json(publicUser(req.user));
}

export async function logout(req, res) {
  await User.updateOne(
    { _id: req.user._id },
    { $inc: { tokenVersion: 1 } }
  );
  res.json({ message: "Logged out from all sessions." });
}

export async function changePassword(req, res) {
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    fail(422, "Current password is incorrect.");
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.mustChangePassword = false;
  user.tokenVersion++;
  await user.save();
  await audit(user, "auth.password.change", "User", user._id, null, {
    passwordChanged: true
  });
  res.json({ token: tokenFor(user), user: publicUser(user) });
}

export async function getSettings(req, res) {
  res.json(await company());
}

export async function updateSettings(req, res) {
  const before = await company();
  try {
    new Intl.DateTimeFormat("en", { timeZone: req.body.timezone });
  } catch {
    fail(422, "Invalid timezone.");
  }
  const after = await Settings.findByIdAndUpdate(
    "company", { $set: req.body }, { new: true, runValidators: true }
  );
  await audit(req.user, "settings.update", "Settings", "company", before, after);
  res.json(after);
}

const resourceModels = {
  departments: Department,
  designations: Designation,
  holidays: Holiday,
  "leave-types": LeaveType
};

export async function resources(req, res) {
  const Model = resourceModels[req.params.kind];
  if (!Model) fail(404, "Resource not found.");
  res.json(await Model.find().sort({ name: 1, date: 1 }).lean());
}

export async function saveResource(req, res) {
  const Model = resourceModels[req.params.kind];
  if (!Model) fail(404, "Resource not found.");
  const before = req.params.id
    ? await Model.findById(req.params.id).lean() : null;
  if (req.params.id && !before) fail(404, "Record not found.");

  const record = req.params.id
    ? await Model.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    )
    : await Model.create(req.body);

  await audit(req.user, before ? "setup.update" : "setup.create",
    Model.modelName, record._id, before, record);
  res.status(before ? 200 : 201).json(record);
}

export async function users(req, res) {
  res.json(await User.find().sort({ createdAt: -1 }).lean());
}

export async function createHR(req, res) {
  const password = tempPassword();
  const user = await User.create({
    email: req.body.email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "hr",
    mustChangePassword: true
  });
  await audit(req.user, "user.hr.create", "User", user._id, null, publicUser(user));
  res.status(201).json({ user: publicUser(user), temporaryPassword: password });
}

export async function manageUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) fail(404, "User not found.");
  if (user.role === "admin") fail(403, "Admin accounts cannot be changed here.");

  const before = publicUser(user);
  let password;
  if (req.body.action === "reset") {
    password = tempPassword();
    user.passwordHash = await bcrypt.hash(password, 12);
    user.mustChangePassword = true;
  } else {
    user.active = req.body.active;
  }
  user.tokenVersion++;
  await user.save();
  await audit(req.user, `user.${req.body.action}`, "User",
    user._id, before, publicUser(user));
  res.json({
    user: publicUser(user),
    ...(password ? { temporaryPassword: password } : {})
  });
}

export async function employeeList(req, res) {
  const { page, limit } = paging(req.query);
  const filter = {};
  if (req.user.role === "employee") filter._id = ownEmployee(req.user);
  if (req.query.department) filter.department = objectId(req.query.department);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    const regex = new RegExp(escapeRegex(String(req.query.q).slice(0, 100)), "i");
    filter.$or = [{ name: regex }, { email: regex }, { code: regex }];
  }
  const [items, total] = await Promise.all([
    Employee.find(filter).populate("department designation")
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function employeeDetail(req, res) {
  scopeEmployee(req.user, req.params.id);
  const employee = await Employee.findById(req.params.id)
    .populate("department designation").lean();
  if (!employee) fail(404, "Employee not found.");
  const [attendance, leaves] = await Promise.all([
    Attendance.find({ employee: employee._id }).sort({ date: -1 }).limit(31).lean(),
    Leave.find({ employee: employee._id }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  res.json({ employee, attendance, leaves });
}

async function validateEmployeeReferences(data) {
  const [department, designation] = await Promise.all([
    Department.exists({ _id: data.department }),
    Designation.exists({ _id: data.designation })
  ]);
  if (!department || !designation) fail(422, "Unknown department or designation.");
  if (data.exitDate && data.exitDate < data.joinDate) {
    fail(422, "Exit date cannot precede join date.");
  }
  if (data.status === "exited" && !data.exitDate) {
    fail(422, "Exited employees require an exit date.");
  }
}

async function registerEmployee(actor, data, session, password) {
  const [employee] = await Employee.create([data], { session, ordered: true });
  await User.create([{
    email: employee.email,
    employeeId: employee._id,
    role: "employee",
    passwordHash: await bcrypt.hash(password, 12),
    mustChangePassword: true
  }], { session, ordered: true });
  await audit(actor, "employee.create", "Employee",
    employee._id, null, employee, session);
  return employee;
}

export async function createEmployee(req, res) {
  await validateEmployeeReferences(req.body);
  const password = tempPassword();
  const employee = await transaction(session =>
    registerEmployee(req.user, req.body, session, password)
  );
  res.status(201).json({ employee, temporaryPassword: password });
}

export async function updateEmployee(req, res) {
  scopeEmployee(req.user, req.params.id);
  const before = await Employee.findById(req.params.id).lean();
  if (!before) fail(404, "Employee not found.");

  const data = req.user.role === "employee"
    ? { phone: req.body.phone, address: req.body.address }
    : req.body;
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

  if (req.user.role !== "employee") {
    await validateEmployeeReferences({ ...before, ...data });
  }

  const after = await Employee.findByIdAndUpdate(
    req.params.id, { $set: data }, { new: true, runValidators: true }
  );
  await audit(req.user, "employee.update", "Employee",
    after._id, before, after);
  res.json(after);
}

export async function exportEmployees(req, res) {
  const employees = await Employee.find()
    .populate("department designation").lean();
  const headers = [
    "code", "name", "email", "department", "designation", "joinDate",
    "basic", "phone", "address", "status"
  ];
  const cell = value => {
    const string = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(string) ? `'${string}` : string;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = employees.map(employee => headers.map(key =>
    cell(["department", "designation"].includes(key)
      ? employee[key]?.name : employee[key])
  ).join(","));
  res.type("text/csv");
  res.attachment("employees.csv");
  res.send([headers.join(","), ...rows].join("\r\n"));
}

export async function importEmployees(req, res) {
  let rows;
  try {
    rows = parse(req.body.csv, {
      columns: true, skip_empty_lines: true, trim: true, bom: true
    });
  } catch {
    fail(422, "Invalid CSV format.");
  }
  if (!rows.length || rows.length > 300) {
    fail(422, "CSV must contain between 1 and 300 rows.");
  }

  const [departments, designations, existing, users] = await Promise.all([
    Department.find().lean(),
    Designation.find().lean(),
    Employee.find().select("code email").lean(),
    User.find().select("email").lean()
  ]);
  const codes = new Set(existing.map(e => e.code));
  const emails = new Set([...existing, ...users].map(e => e.email));
  const errors = [];
  const normalized = [];

  rows.forEach((row, index) => {
    const add = (field, reason) => errors.push({ row: index + 2, field, reason });
    for (const field of [
      "code", "name", "email", "department", "designation", "joinDate", "basic"
    ]) {
      if (!row[field]) add(field, "Required field.");
    }

    const email = String(row.email || "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add("email", "Invalid email.");
    if (emails.has(email)) add("email", "Duplicate email.");
    if (codes.has(row.code)) add("code", "Duplicate employee code.");
    if (!validDate(row.joinDate)) add("joinDate", "Expected ISO YYYY-MM-DD.");
    if (!Number.isFinite(Number(row.basic)) || Number(row.basic) <= 0) {
      add("basic", "Salary must be greater than zero.");
    }
    const department = departments.find(d => d.name === row.department);
    const designation = designations.find(d => d.name === row.designation);
    if (!department) add("department", "Unknown department.");
    if (!designation) add("designation", "Unknown designation.");

    codes.add(row.code);
    emails.add(email);
    normalized.push({
      code: row.code,
      name: row.name,
      email,
      department: department?._id,
      designation: designation?._id,
      joinDate: row.joinDate,
      basic: Number(row.basic),
      phone: row.phone || "",
      address: row.address || "",
      status: "active"
    });
  });

  if (req.body.dryRun || errors.length) {
    return res.status(errors.length ? 422 : 200).json({
      valid: errors.length === 0,
      count: rows.length,
      errors
    });
  }

  const credentials = await transaction(async session => {
    const result = [];
    for (const data of normalized) {
      const password = tempPassword();
      await registerEmployee(req.user, data, session, password);
      result.push({ email: data.email, temporaryPassword: password });
    }
    return result;
  });
  res.status(201).json({ imported: credentials.length, credentials });
}

export async function checkIn(req, res) {
  const employeeId = ownEmployee(req.user);
  const settings = await company();
  const now = new Date();
  const date = zonedParts(now, settings.timezone).date;
  await assertUnlocked(date);
  const employee = await Employee.findById(employeeId).lean();
  if (!employee || employee.status === "exited" || !employmentOn(employee, date)) {
    fail(422, "You are not an active employee.");
  }
  if (!(await workingDays(date, date, settings)).length) {
    fail(422, "Today is not a working day.");
  }
  if (await Leave.exists({
    employee: employeeId, status: "approved", days: date
  })) fail(422, "You are on approved leave today.");

  const record = await Attendance.create({
    employee: employeeId,
    date,
    checkIn: now,
    ...attendanceValues(now, null, settings),
    rules: {
      officeStart: settings.officeStart,
      graceMinutes: settings.graceMinutes,
      halfDayHours: settings.halfDayHours
    }
  });
  await audit(req.user, "attendance.checkin", "Attendance",
    record._id, null, record);
  res.status(201).json(record);
}

export async function checkOut(req, res) {
  const employeeId = ownEmployee(req.user);
  const settings = await company();
  const now = new Date();
  const date = zonedParts(now, settings.timezone).date;
  await assertUnlocked(date);
  const before = await Attendance.findOne({ employee: employeeId, date }).lean();
  if (!before) fail(422, "Check in first.");
  if (before.checkOut) fail(409, "Already checked out.");

  const record = await Attendance.findOneAndUpdate({
    _id: before._id, checkOut: null
  }, {
    $set: {
      checkOut: now,
      ...attendanceValues(before.checkIn, now, {
        ...before.rules, timezone: settings.timezone
      })
    }
  }, { new: true });
  if (!record) fail(409, "Already checked out.");
  await audit(req.user, "attendance.checkout", "Attendance",
    record._id, before, record);
  res.json(record);
}

export async function attendance(req, res) {
  res.json(await attendanceReport(req.user, req.query));
}

export async function corrections(req, res) {
  const filter = req.user.role === "employee"
    ? { employee: ownEmployee(req.user) } : {};
  res.json(await Correction.find(filter)
    .populate("employee", "name code").sort({ createdAt: -1 }).limit(200).lean());
}

export async function requestCorrection(req, res) {
  const settings = await company();
  const today = zonedParts(new Date(), settings.timezone).date;
  if (req.body.date > today) fail(422, "Cannot correct a future day.");
  const checkIn = new Date(req.body.checkIn);
  const checkOut = new Date(req.body.checkOut);
  if (checkOut <= checkIn || checkOut > new Date()) {
    fail(422, "Invalid correction times.");
  }
  if (
    zonedParts(checkIn, settings.timezone).date !== req.body.date ||
    zonedParts(checkOut, settings.timezone).date !== req.body.date
  ) fail(422, "Both times must fall on the selected company-local date.");

  await assertUnlocked(req.body.date);
  const employee = await Employee.findById(ownEmployee(req.user)).lean();
  if (!employee || !employmentOn(employee, req.body.date)) {
    fail(422, "Date is outside employment.");
  }
  if (!(await workingDays(req.body.date, req.body.date)).length) {
    fail(422, "Selected date is not a working day.");
  }

  const record = await Correction.create({
    ...req.body, employee: employee._id
  });
  await audit(req.user, "correction.request", "Correction",
    record._id, null, record);
  res.status(201).json(record);
}

export async function reviewCorrection(req, res) {
  const record = await transaction(async session => {
    const before = await Correction.findById(req.params.id).session(session).lean();
    if (!before) fail(404, "Correction not found.");
    if (before.status !== "pending") fail(409, "Already reviewed.");
    if (String(before.employee) === String(req.user.employeeId)) {
      fail(403, "You cannot approve your own correction.");
    }

    await assertUnlocked(before.date, session);
    if (req.body.status === "approved") {
      if (await Leave.exists({
        employee: before.employee, status: "approved", days: before.date
      }).session(session)) fail(422, "Approved leave exists for this date.");

      const settings = await company();
      const old = await Attendance.findOne({
        employee: before.employee, date: before.date
      }).session(session).lean();
      const ruleSettings = old
        ? { ...old.rules, timezone: settings.timezone } : settings;

      const after = await Attendance.findOneAndUpdate({
        employee: before.employee, date: before.date
      }, {
        $set: {
          checkIn: before.checkIn,
          checkOut: before.checkOut,
          ...attendanceValues(before.checkIn, before.checkOut, ruleSettings),
          source: "correction",
          rules: {
            officeStart: ruleSettings.officeStart,
            graceMinutes: ruleSettings.graceMinutes,
            halfDayHours: ruleSettings.halfDayHours
          }
        }
      }, { upsert: true, new: true, session, runValidators: true });
      await audit(req.user, "attendance.correct", "Attendance",
        after._id, old, after, session);
    }

    const after = await Correction.findOneAndUpdate({
      _id: before._id, status: "pending"
    }, {
      $set: { ...req.body, reviewedBy: req.user._id }
    }, { new: true, session });
    if (!after) fail(409, "Already reviewed.");
    await audit(req.user, "correction.review", "Correction",
      after._id, before, after, session);
    await notifyEmployee(before.employee, `Correction ${after.status}`,
      after.comment, session);
    return after;
  });
  res.json(record);
}

export async function leaves(req, res) {
  const employee = scopeEmployee(req.user, req.query.employee);
  const filter = employee ? { employee } : {};
  if (req.query.status) filter.status = req.query.status;
  res.json(await Leave.find(filter)
    .populate("employee", "name code")
    .sort({ createdAt: -1 }).limit(200).lean());
}

export async function balances(req, res) {
  const settings = await company();
  const year = req.query.year ||
    zonedParts(new Date(), settings.timezone).date.slice(0, 4);
  const employee = scopeEmployee(req.user, req.query.employee) ||
    ownEmployee(req.user);
  res.json(await leaveBalances(employee, year));
}

export async function applyLeave(req, res) {
  res.status(201).json(await createLeave(req.user, req.body));
}

export async function cancelLeave(req, res) {
  const after = await transaction(async session => {
    const before = await Leave.findOne({
      _id: req.params.id, employee: ownEmployee(req.user)
    }).session(session).lean();
    if (!before) fail(404, "Leave not found.");
    if (!["pending", "approved"].includes(before.status)) {
      fail(409, "This request cannot be cancelled.");
    }
    const settings = await company();
    const today = zonedParts(new Date(), settings.timezone).date;
    if (before.start < today) fail(422, "Past leave cannot be cancelled.");

    await Employee.updateOne({ _id: before.employee },
      { $inc: { leaveLedgerVersion: 1 } }, { session });
    for (const date of before.days) await assertUnlocked(date, session);

    const updated = await Leave.findOneAndUpdate({
      _id: before._id, status: before.status
    }, { $set: { status: "cancelled" } }, { new: true, session });
    if (!updated) fail(409, "Leave changed. Refresh and retry.");
    await audit(req.user, "leave.cancel", "Leave",
      before._id, before, updated, session);
    return updated;
  });
  res.json(after);
}

export async function reviewLeave(req, res) {
  const after = await transaction(async session => {
    const before = await Leave.findById(req.params.id).session(session).lean();
    if (!before) fail(404, "Leave not found.");
    if (before.status !== "pending") fail(409, "Already reviewed.");
    if (String(before.employee) === String(req.user.employeeId)) {
      fail(403, "You cannot approve your own leave.");
    }

    await Employee.updateOne({ _id: before.employee },
      { $inc: { leaveLedgerVersion: 1 } }, { session });
    for (const date of before.days) await assertUnlocked(date, session);

    if (req.body.status === "approved" && await Attendance.exists({
      employee: before.employee, date: { $in: before.days }
    }).session(session)) fail(422, "Attendance exists on a requested day.");

    const updated = await Leave.findOneAndUpdate({
      _id: before._id, status: "pending"
    }, {
      $set: { ...req.body, reviewedBy: req.user._id }
    }, { new: true, session });
    if (!updated) fail(409, "Already reviewed.");

    await audit(req.user, "leave.review", "Leave",
      before._id, before, updated, session);
    await notifyEmployee(before.employee, `Leave ${updated.status}`,
      updated.comment, session);
    return updated;
  });
  res.json(after);
}

export async function payrollList(req, res) {
  if (req.user.role === "employee") {
    const runs = await Payroll.find({
      status: "finalized", "slips.employee": ownEmployee(req.user)
    }).sort({ month: -1 }).lean();
    return res.json(runs.map(run => ({
      ...run,
      slips: run.slips.filter(s =>
        String(s.employee) === String(req.user.employeeId))
    })));
  }
  res.json(await Payroll.find().sort({ month: -1 }).lean());
}

export async function createPayroll(req, res) {
  monthBounds(req.body.month);
  const payroll = await transaction(async session => {
    const existing = await Payroll.findOne({
      month: req.body.month
    }).session(session).lean();
    if (existing?.status === "finalized") fail(409, "Payroll is locked.");
    const data = await buildPayroll(req.body.month, req.user, session);
    const run = await Payroll.findOneAndUpdate({
      month: req.body.month,
      status: "draft"
    }, {
      $set: data,
      $setOnInsert: { status: "draft" }
    }, { upsert: true, new: true, session, runValidators: true });
    await audit(req.user, "payroll.draft", "Payroll",
      run._id, existing, run, session);
    return run;
  });
  res.json(payroll);
}

export async function finalizePayroll(req, res) {
  const result = await transaction(async session => {
    const before = await Payroll.findById(req.params.id).session(session).lean();
    if (!before) fail(404, "Payroll not found.");
    if (before.status === "finalized") fail(409, "Already finalized.");

    const fresh = await buildPayroll(before.month, req.user, session);
    const run = await Payroll.findOneAndUpdate({
      _id: before._id, status: "draft"
    }, {
      $set: {
        slips: fresh.slips,
        status: "finalized",
        finalizedBy: req.user._id,
        finalizedAt: new Date()
      }
    }, { new: true, session });
    if (!run) fail(409, "Payroll changed. Refresh and retry.");

    await audit(req.user, "payroll.finalize", "Payroll",
      run._id, before, run, session);
    for (const slip of run.slips) {
      await notifyEmployee(slip.employee, "Payslip available", run.month, session);
    }
    return run;
  });
  res.json(result);
}

export async function payslip(req, res) {
  scopeEmployee(req.user, req.params.employeeId);
  const run = await Payroll.findById(req.params.id).lean();
  if (!run) fail(404, "Payroll not found.");
  if (run.status !== "finalized") fail(409, "Payslip is not finalized.");
  const slip = run.slips.find(s =>
    String(s.employee) === req.params.employeeId);
  if (!slip) fail(404, "Payslip not found.");

  const settings = await company();
  res.type("application/pdf");
  res.attachment(`payslip-${run.month}-${slip.code}.pdf`);
  const document = new PDFDocument({ margin: 48 });
  document.on("error", error => {
    console.error(error);
    if (!res.destroyed) res.destroy(error);
  });
  document.pipe(res);
  document.fontSize(22).text(settings.name);
  document.fontSize(16).text(`Payslip - ${run.month}`);
  document.moveDown();
  document.fontSize(11);
  for (const [label, value] of Object.entries({
    Employee: slip.name,
    Code: slip.code,
    Department: slip.departmentName,
    Basic: slip.basic,
    HRA: slip.hra,
    Medical: slip.medical,
    "Full-month gross": slip.gross,
    "Prorated gross": slip.payableGross,
    "Working days": slip.workingDays,
    "Eligible days": slip.eligibleDays,
    "Absent days": slip.absentDays,
    "Unpaid days": slip.unpaidDays,
    "Half days": slip.halfDays,
    Deductions: slip.deduction,
    Tax: slip.tax,
    "Net pay": slip.net
  })) document.text(`${label}: ${value}`);
  document.end();
}

export async function analytics(req, res) {
  res.json(await dashboard(req.user, req.query));
}

export async function announcements(req, res) {
  res.json(await Announcement.find()
    .sort({ createdAt: -1 }).limit(50).lean());
}

export async function postAnnouncement(req, res) {
  const record = await Announcement.create({
    ...req.body, actor: req.user._id
  });
  await audit(req.user, "announcement.create", "Announcement",
    record._id, null, record);
  res.status(201).json(record);
}

export async function notifications(req, res) {
  res.json(await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 }).limit(100).lean());
}

export async function readNotification(req, res) {
  const record = await Notification.findOneAndUpdate({
    _id: req.params.id, user: req.user._id
  }, { $set: { read: true } }, { new: true });
  if (!record) fail(404, "Notification not found.");
  res.json(record);
}

export async function auditLogs(req, res) {
  const { page, limit } = paging(req.query);
  const [items, total] = await Promise.all([
    Audit.find().populate("actor", "email role")
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Audit.countDocuments()
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}