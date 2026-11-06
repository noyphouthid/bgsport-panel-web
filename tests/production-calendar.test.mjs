import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarCells, formatCalendarDate, getCalendarMonth, shiftCalendarMonth } from "../lib/production-calendar.ts";

test("December 2026 starts on Tuesday with two leading blanks", () => {
  const cells = buildCalendarCells({ year: 2026, month: 11 });
  assert.deepEqual(cells.slice(0, 3), [null, null, "2026-12-01"]);
  assert.equal(cells.at(-1), "2026-12-31");
  assert.equal(cells.filter(Boolean).length, 31);
});

test("February follows leap years", () => {
  assert.equal(buildCalendarCells({ year: 2028, month: 1 }).at(-1), "2028-02-29");
  assert.equal(buildCalendarCells({ year: 2027, month: 1 }).at(-1), "2027-02-28");
});

test("month helpers wrap around the year", () => {
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftCalendarMonth({ year: 2027, month: 0 }, -1), { year: 2026, month: 11 });
  assert.deepEqual(getCalendarMonth("2026-12-09"), { year: 2026, month: 11 });
  assert.equal(getCalendarMonth("bad"), null);
});

test("formatCalendarDate shows day first and tolerates empty values", () => {
  assert.equal(formatCalendarDate("2026-12-09"), "09/12/2026");
  assert.equal(formatCalendarDate(""), "");
});
