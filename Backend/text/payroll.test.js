import test from "node:test";
import assert from "node:assert/strict";
import {
  annualTax, calculateSlip, validDate, dateRange
} from "../src/services.js";

test("annual tax slab boundaries", () => {
  assert.equal(annualTax(600000), 0);
  assert.equal(annualTax(1200000), 30000);
  assert.equal(annualTax(2400000), 210000);
  assert.equal(annualTax(3600000), 510000);
  assert.equal(annualTax(4000000), 650000);
});

test("payroll deductions and proration", () => {
  const slip = calculateSlip({
    employee: {
      _id: "employee",
      name: "Test",
      code: "E001",
      basic: 40000
    },
    workingDayCount: 20,
    eligibleDays: 10,
    absentDays: 1,
    unpaidDays: 1,
    halfDays: 1
  });
  assert.equal(slip.gross, 60000);
  assert.equal(slip.payableGross, 30000);
  assert.equal(slip.deduction, 7500);
  assert.equal(slip.tax, 187.5);
  assert.equal(slip.net, 22312.5);
});

test("strict dates reject rollover dates", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-10-24"), true);
  assert.deepEqual(dateRange("2026-10-24", "2026-10-25"), [
    "2026-10-24", "2026-10-25"
  ]);
});
