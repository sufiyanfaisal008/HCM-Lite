import mongoose from "mongoose";
import {
  Settings, Holiday, Employee, Attendance, Leave, LeaveType,
  Payroll, Audit, User, Notification
} from "./models.js";
import { fail, objectId, scopeEmployee } from "./middleware.js";

export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value;
}

export function dateRange(start, end) {
  if (!validDate(start) || !validDate(end) || start > end) {
    fail(422, "Invalid date range.");
  }
  const days = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (days.length > 370) fail(422, "Maximum range is 370 days.");
  }
  return days;
}

export function zonedParts(value = new Date(), timezone = "Asia/Karachi") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(value))
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

export async function company() {
  const settings = await Settings.findById("company").lean();
  if (!settings) fail(409, "Complete company setup first.");
  return settings;
}

export async function workingDays(start, end, settings) {
  const s = settings || await company();
  const holidays = new Set(
    (await Holiday.find({ date: { $gte: start, $lte: end } }).lean())
      .map(h => h.date)
  );
  return dateRange(start, end).filter(date => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return !s.weekends.includes(weekday) && !holidays.has(date);
  });
}

export function employmentOn(employee, date) {
  return employee.joinDate <= date &&
    (!employee.exitDate || employee.exitDate >= date);
}

export async function audit(
  actor, action, entity, entityId, before, after, session
) {
  await Audit.create([{
    actor: actor._id,
    action,
    entity,
    entityId: String(entityId),
    before: before ?? null,
    after: after ?? null
  }], session ? { session } : {});
}

export async function notifyEmployee(employee, title, body = "", session) {
  const user = await User.findOne({ employeeId: employee }).session(session || null);
  if (user) {
    await Notification.create([{
      user: user._id, title, body
    }], session ? { session } : {});
  }
}

export async function transaction(fn) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) {
    fail(422, "Month must use YYYY-MM format.");
  }
  const [year, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10)
  };
}

export async function assertUnlocked(date, session) {
  const locked = await Payroll.findOne({
    month: date.slice(0, 7),
    status: "finalized"
  }).session(session || null);
  if (locked) fail(409, "This month is finalized and locked.");
}

export function attendanceValues(checkIn, checkOut, settings, timezone) {
  const local = zonedParts(checkIn, timezone || settings.timezone);
  const [hour, minute] = settings.officeStart.split(":").map(Number);
  const late = local.minutes >
    hour * 60 + minute + settings.graceMinutes;
  const hours = checkOut
    ? Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 3600000)
    : 0;

  return {
    late,
    hours: round(hours),
    status: !checkOut
      ? "missing_checkout"
      : hours < settings.halfDayHours
        ? "half_day"
        : late ? "late" : "present"
  };
}

export async function leaveBalances(employeeId, year) {
  if (!/^\d{4}$/.test(String(year))) fail(422, "Invalid year.");
  const types = await LeaveType.find().lean();
  const requests = await Leave.find({
    employee: employeeId,
    status: { $in: ["approved", "pending"] },
    days: { $elemMatch: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }
  }).lean();

  return types.map(type => {
    let used = 0;
    let reserved = 0;
    for (const leave of requests) {
      if (String(leave.type) !== String(type._id)) continue;
      const count = leave.days.filter(d => d.startsWith(`${year}-`)).length;
      if (leave.status === "approved") used += count;
      else reserved += count;
    }
    return {
      id: type._id,
      name: type.name,
      unpaid: type.unpaid,
      quota: type.unpaid ? null : type.quota,
      used,
      reserved,
      remaining: type.unpaid ? null : Math.max(0, type.quota - used),
      availableToApply: type.unpaid
        ? null : Math.max(0, type.quota - used - reserved)
    };
  });
}

export async function createLeave(user, data) {
  const employeeId = user.employeeId;
  if (!employeeId) fail(422, "Employee profile required.");

  const days = await workingDays(data.start, data.end);
  if (!days.length) fail(422, "No working days in this range.");
  const type = await LeaveType.findById(data.type).lean();
  if (!type) fail(422, "Unknown leave type.");

  return transaction(async session => {
    const employee = await Employee.findOneAndUpdate(
      { _id: employeeId, status: { $ne: "exited" } },
      { $inc: { leaveLedgerVersion: 1 } },
      { new: true, session }
    );
    if (!employee) fail(422, "Active employee profile required.");
    if (days.some(day => !employmentOn(employee, day))) {
      fail(422, "Leave must fall within employment dates.");
    }

    for (const date of new Set(days.map(d => `${d.slice(0, 7)}-01`))) {
      await assertUnlocked(date, session);
    }

    const overlap = await Leave.findOne({
      employee: employeeId,
      status: { $in: ["pending", "approved"] },
      days: { $in: days }
    }).session(session);
    if (overlap) fail(422, "Leave overlaps an existing request.");

    const attended = await Attendance.exists({
      employee: employeeId,
      date: { $in: days }
    }).session(session);
    if (attended) fail(422, "Attendance already exists for a selected day.");

    if (!type.unpaid) {
      for (const year of new Set(days.map(d => d.slice(0, 4)))) {
        const existing = await Leave.find({
          employee: employeeId,
          type: type._id,
          status: { $in: ["pending", "approved"] }
        }).session(session).lean();

        const reserved = existing.reduce((sum, leave) =>
          sum + leave.days.filter(d => d.startsWith(`${year}-`)).length, 0);
        const requested = days.filter(d => d.startsWith(`${year}-`)).length;
        if (reserved + requested > type.quota) {
          fail(422, `Insufficient ${type.name} balance for ${year}.`);
        }
      }
    }

    const [leave] = await Leave.create([{
      ...data,
      employee: employeeId,
      type: type._id,
      typeName: type.name,
      unpaid: type.unpaid,
      quotaSnapshot: type.quota,
      days
    }], { session });

    await audit(user, "leave.create", "Leave", leave._id, null, leave, session);
    return leave;
  });
}

export function annualTax(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
}

export function calculateSlip({
  employee, workingDayCount, eligibleDays,
  absentDays, unpaidDays, halfDays
}) {
  const basic = employee.basic;
  const gross = basic * 1.5;
  const daily = workingDayCount ? gross / workingDayCount : 0;
  const payableGross = daily * eligibleDays;
  const deduction = Math.min(
    payableGross,
    daily * (absentDays + unpaidDays + halfDays * 0.5)
  );
  const taxablePay = Math.max(0, payableGross - deduction);
  const tax = gross
    ? annualTax(gross * 12) / 12 * (taxablePay / gross)
    : 0;

  return {
    employee: employee._id,
    name: employee.name,
    code: employee.code,
    department: employee.department?._id || employee.department,
    designation: employee.designation?._id || employee.designation,
    departmentName: employee.department?.name || "",
    basic: round(basic),
    hra: round(basic * 0.4),
    medical: round(basic * 0.1),
    gross: round(gross),
    payableGross: round(payableGross),
    workingDays: workingDayCount,
    eligibleDays,
    absentDays,
    unpaidDays,
    halfDays,
    deduction: round(deduction),
    tax: round(tax),
    net: round(Math.max(0, taxablePay - tax))
  };
}

export async function buildPayroll(month, actor, session) {
  const { start, end } = monthBounds(month);
  const days = await workingDays(start, end);
  const employees = await Employee.find({
    joinDate: { $lte: end },
    $or: [{ exitDate: null }, { exitDate: { $gte: start } }]
  }).populate("department designation").session(session || null).lean();

  const attendance = await Attendance.find({
    date: { $gte: start, $lte: end }
  }).session(session || null).lean();
  const leaves = await Leave.find({
    status: "approved",
    days: { $elemMatch: { $gte: start, $lte: end } }
  }).session(session || null).lean();

  const attendanceMap = new Map(attendance.map(a => [
    `${a.employee}:${a.date}`, a
  ]));
  const leaveMap = new Map();
  for (const leave of leaves) {
    for (const day of leave.days) {
      leaveMap.set(`${leave.employee}:${day}`, leave);
    }
  }

  const slips = employees.map(employee => {
    const eligible = days.filter(day => employmentOn(employee, day));
    let absentDays = 0;
    let unpaidDays = 0;
    let halfDays = 0;

    for (const day of eligible) {
      const key = `${employee._id}:${day}`;
      const leave = leaveMap.get(key);
      const attendanceRecord = attendanceMap.get(key);
      if (leave) {
        if (leave.unpaid) unpaidDays++;
      } else if (!attendanceRecord) {
        absentDays++;
      } else if (attendanceRecord.status === "half_day") {
        halfDays++;
      }
    }

    return calculateSlip({
      employee,
      workingDayCount: days.length,
      eligibleDays: eligible.length,
      absentDays,
      unpaidDays,
      halfDays
    });
  });

  return { month, slips, createdBy: actor._id };
}

export async function attendanceReport(user, filters = {}) {
  const settings = await company();
  const today = zonedParts(new Date(), settings.timezone).date;
  const start = filters.start || today;
  const end = filters.end || today;
  const days = await workingDays(start, end, settings);
  const employeeId = scopeEmployee(user, filters.employee);
  const match = {};
  if (employeeId) match._id = objectId(String(employeeId));
  if (filters.department) match.department = objectId(filters.department);

  const employees = await Employee.find(match)
    .populate("department", "name").lean();

  const ids = employees.map(e => e._id);
  const records = await Attendance.find({
    employee: { $in: ids },
    date: { $gte: start, $lte: end }
  }).lean();
  const leaves = await Leave.find({
    employee: { $in: ids },
    status: "approved",
    days: { $elemMatch: { $gte: start, $lte: end } }
  }).lean();

  const map = new Map(records.map(a => [`${a.employee}:${a.date}`, a]));
  const leaveMap = new Map();
  for (const leave of leaves) {
    for (const day of leave.days) leaveMap.set(`${leave.employee}:${day}`, leave);
  }

  const result = [];
  for (const employee of employees) {
    // Stored attendance is retained even if settings later mark the day off.
    const employeeDays = new Set([
      ...days,
      ...records.filter(r => String(r.employee) === String(employee._id))
        .map(r => r.date)
    ]);

    for (const date of [...employeeDays].sort()) {
      if (!employmentOn(employee, date) || date > today) continue;
      const key = `${employee._id}:${date}`;
      const attendance = map.get(key);
      const leave = leaveMap.get(key);
      result.push({
        employee: employee._id,
        name: employee.name,
        department: employee.department?.name || "",
        date,
        status: attendance?.status ||
          (leave ? "on_leave" : date === today ? "not_checked_in" : "absent"),
        hours: attendance?.hours || 0,
        late: attendance?.late || false,
        checkIn: attendance?.checkIn || null,
        checkOut: attendance?.checkOut || null
      });
    }
  }
  return result;
}

export async function dashboard(user, filters = {}) {
  const settings = await company();
  const today = zonedParts(new Date(), settings.timezone).date;
  const start = filters.start || `${today.slice(0, 7)}-01`;
  const end = filters.end || today;
  dateRange(start, end);

  const employeeMatch = {};
  if (user.role === "employee") {
    employeeMatch._id = objectId(String(user.employeeId));
  }
  if (filters.department) {
    employeeMatch.department = objectId(filters.department);
  }

  const employees = await Employee.find(employeeMatch).lean();
  const ids = employees.map(e => e._id);
  const headcountAt = date => employees.filter(e =>
    e.joinDate <= date && (!e.exitDate || e.exitDate > date)
  ).length;

  const headcount = headcountAt(end);
  const exits = employees.filter(e =>
    e.exitDate && e.exitDate >= start && e.exitDate <= end
  ).length;
  const averageHeadcount = (headcountAt(start) + headcount) / 2;

  const rows = await attendanceReport(user, {
    start, end, department: filters.department
  });
  const todayRows = await attendanceReport(user, {
    start: today, end: today, department: filters.department
  });

  const attendanceTrend = await Attendance.aggregate([
    { $match: {
      employee: { $in: ids },
      date: { $gte: start, $lte: end }
    } },
    { $group: {
      _id: "$date",
      checkedIn: { $sum: 1 },
      hours: { $sum: "$hours" },
      late: { $sum: { $cond: ["$late", 1, 0] } }
    } },
    { $sort: { _id: 1 } }
  ]);

  const headcountByDepartment = await Employee.aggregate([
    { $match: {
      ...employeeMatch,
      joinDate: { $lte: end },
      $or: [{ exitDate: null }, { exitDate: { $gt: end } }]
    } },
    { $group: {
      _id: "$department",
      headcount: { $sum: 1 },
      averageGross: { $avg: { $multiply: ["$basic", 1.5] } }
    } },
    { $lookup: {
      from: "departments", localField: "_id",
      foreignField: "_id", as: "department"
    } },
    { $project: {
      _id: 0,
      department: { $arrayElemAt: ["$department.name", 0] },
      headcount: 1,
      averageGross: 1
    } }
  ]);

  const payroll = await Payroll.aggregate([
    { $match: {
      status: "finalized",
      month: { $gte: start.slice(0, 7), $lte: end.slice(0, 7) }
    } },
    { $unwind: "$slips" },
    { $match: { "slips.employee": { $in: ids } } },
    { $group: {
      _id: { month: "$month", department: "$slips.departmentName" },
      gross: { $sum: "$slips.payableGross" },
      net: { $sum: "$slips.net" }
    } },
    { $sort: { "_id.month": 1 } }
  ]);

  const counts = {};
  const byDepartment = {};
  const latePeople = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    const name = row.department || "Unassigned";
    byDepartment[name] ||= { department: name, expected: 0, absent: 0 };
    if (row.status !== "not_checked_in") byDepartment[name].expected++;
    if (row.status === "absent") byDepartment[name].absent++;
    if (row.late) {
      const key = String(row.employee);
      latePeople[key] ||= { name: row.name, count: 0 };
      latePeople[key].count++;
    }
  }

  const numerator = (counts.present || 0) + (counts.late || 0) +
    (counts.missing_checkout || 0) + 0.5 * (counts.half_day || 0);
  const denominator = rows.filter(r =>
    !["on_leave", "not_checked_in"].includes(r.status)
  ).length;

  const pendingLeaves = await Leave.countDocuments({
    employee: { $in: ids }, status: "pending"
  });

  const approvedLeaves = await Leave.find({
    employee: { $in: ids },
    status: "approved",
    days: { $elemMatch: { $gte: start, $lte: end } }
  }).lean();

  const leaveByType = {};
  for (const leave of approvedLeaves) {
    leaveByType[leave.typeName] = (leaveByType[leave.typeName] || 0) +
      leave.days.filter(d => d >= start && d <= end).length;
  }

  const gender = {};
  const tenure = { under1Year: 0, oneTo3Years: 0, over3Years: 0 };
  for (const employee of employees.filter(e => employmentOn(e, end))) {
    gender[employee.gender] = (gender[employee.gender] || 0) + 1;
    const years = (new Date(end) - new Date(employee.joinDate)) / 31557600000;
    tenure[years < 1 ? "under1Year" : years <= 3 ? "oneTo3Years" : "over3Years"]++;
  }

  const result = {
    filters: { start, end, department: filters.department || null },
    kpis: {
      headcount,
      attrition: round(averageHeadcount ? exits / averageHeadcount * 100 : 0),
      presentToday: todayRows.filter(r =>
        ["present", "late", "missing_checkout", "half_day"].includes(r.status)
      ).length,
      lateToday: todayRows.filter(r => r.late).length,
      onLeaveToday: todayRows.filter(r => r.status === "on_leave").length,
      pendingLeaves,
      attendanceRate: round(denominator ? numerator / denominator * 100 : 0),
      latePercent: round(
        ((counts.present || 0) + (counts.late || 0))
          ? (counts.late || 0) /
            ((counts.present || 0) + (counts.late || 0)) * 100
          : 0
      ),
      payrollNet: round(payroll.reduce((sum, p) => sum + p.net, 0)),
      averageGross: round(
        employees.length
          ? employees.reduce((sum, e) => sum + e.basic * 1.5, 0) / employees.length
          : 0
      ),
      hours: round(rows.reduce((sum, r) => sum + r.hours, 0)),
      lateCount: rows.filter(r => r.late).length
    },
    attendanceTrend,
    headcountByDepartment,
    absenteeism: Object.values(byDepartment).map(d => ({
      ...d,
      percent: round(d.expected ? d.absent / d.expected * 100 : 0)
    })),
    topLateComers: Object.values(latePeople)
      .sort((a, b) => b.count - a.count).slice(0, 5),
    leaveByType,
    payroll,
    gender,
    tenure
  };

  if (user.role === "employee") {
    result.leaveBalance = await leaveBalances(
      user.employeeId, today.slice(0, 4)
    );
    const lastRun = await Payroll.findOne({
      status: "finalized", "slips.employee": user.employeeId
    }).sort({ month: -1 }).lean();
    result.lastPayslip = lastRun
      ? {
        run: lastRun._id,
        month: lastRun.month,
        slip: lastRun.slips.find(s =>
          String(s.employee) === String(user.employeeId))
      }
      : null;
  }

  if (user.role === "admin") {
    result.auditFeed = await Audit.find().sort({ createdAt: -1 }).limit(10).lean();
  }
  return result;
}
