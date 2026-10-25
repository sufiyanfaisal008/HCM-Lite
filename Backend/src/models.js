import mongoose from "mongoose";

const { Schema, model } = mongoose;
const ref = (name, required = false) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required
});
const options = { timestamps: true };

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ["admin", "hr", "employee"],
    required: true
  },
  employeeId: ref("Employee"),
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 }
}, options);

const settingsSchema = new Schema({
  _id: { type: String, default: "company" },
  name: { type: String, required: true },
  timezone: { type: String, default: "Asia/Karachi" },
  officeStart: { type: String, default: "09:00" },
  graceMinutes: { type: Number, default: 15 },
  halfDayHours: { type: Number, default: 5 },
  weekends: { type: [Number], default: [0, 6] },
  latitude: { type: Number, default: 24.8607 },
  longitude: { type: Number, default: 67.0011 },
  radius: { type: Number, default: 150 }
}, options);

const departmentSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true }
}, options);

const designationSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true }
}, options);

const holidaySchema = new Schema({
  date: { type: String, required: true, unique: true },
  name: { type: String, required: true }
}, options);

const leaveTypeSchema = new Schema({
  name: { type: String, required: true, unique: true, lowercase: true },
  quota: { type: Number, required: true, min: 0 },
  unpaid: { type: Boolean, default: false }
}, options);

const employeeSchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  department: ref("Department", true),
  designation: ref("Designation", true),
  joinDate: { type: String, required: true },
  exitDate: { type: String, default: null },
  status: {
    type: String,
    enum: ["active", "probation", "exited"],
    default: "active"
  },
  gender: { type: String, default: "unspecified" },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  basic: { type: Number, required: true, min: 1 },
  leaveLedgerVersion: { type: Number, default: 0 }
}, options);

const attendanceSchema = new Schema({
  employee: ref("Employee", true),
  date: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, default: null },
  late: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["present", "late", "half_day", "missing_checkout"],
    default: "missing_checkout"
  },
  hours: { type: Number, default: 0 },
  source: { type: String, default: "web" },
  rules: {
    officeStart: String,
    graceMinutes: Number,
    halfDayHours: Number
  }
}, options);
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

const correctionSchema = new Schema({
  employee: ref("Employee", true),
  date: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  comment: { type: String, default: "" },
  reviewedBy: ref("User")
}, options);

const leaveSchema = new Schema({
  employee: ref("Employee", true),
  type: ref("LeaveType", true),
  typeName: { type: String, required: true },
  unpaid: { type: Boolean, required: true },
  quotaSnapshot: { type: Number, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  days: { type: [String], required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "cancelled"],
    default: "pending"
  },
  comment: { type: String, default: "" },
  reviewedBy: ref("User")
}, options);
leaveSchema.index({ employee: 1, start: 1, end: 1 });

const payrollSchema = new Schema({
  month: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ["draft", "finalized"],
    default: "draft"
  },
  createdBy: ref("User", true),
  finalizedBy: ref("User"),
  finalizedAt: Date,
  slips: [{
    employee: ref("Employee", true),
    name: String,
    code: String,
    department: ref("Department"),
    designation: ref("Designation"),
    departmentName: String,
    basic: Number,
    hra: Number,
    medical: Number,
    gross: Number,
    payableGross: Number,
    workingDays: Number,
    eligibleDays: Number,
    absentDays: Number,
    unpaidDays: Number,
    halfDays: Number,
    deduction: Number,
    tax: Number,
    net: Number
  }]
}, options);

const announcementSchema = new Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  actor: ref("User", true)
}, options);

const notificationSchema = new Schema({
  user: ref("User", true),
  title: { type: String, required: true },
  body: { type: String, default: "" },
  read: { type: Boolean, default: false }
}, options);

const auditSchema = new Schema({
  actor: ref("User", true),
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null }
}, options);

const aiLogSchema = new Schema({
  actor: ref("User", true),
  feature: String,
  success: Boolean,
  durationMs: Number,
  error: String
}, options);

export const User = model("User", userSchema);
export const Settings = model("Settings", settingsSchema);
export const Department = model("Department", departmentSchema);
export const Designation = model("Designation", designationSchema);
export const Holiday = model("Holiday", holidaySchema);
export const LeaveType = model("LeaveType", leaveTypeSchema);
export const Employee = model("Employee", employeeSchema);
export const Attendance = model("Attendance", attendanceSchema);
export const Correction = model("Correction", correctionSchema);
export const Leave = model("Leave", leaveSchema);
export const Payroll = model("Payroll", payrollSchema);
export const Announcement = model("Announcement", announcementSchema);
export const Notification = model("Notification", notificationSchema);
export const Audit = model("Audit", auditSchema);
export const AILog = model("AILog", aiLogSchema);
