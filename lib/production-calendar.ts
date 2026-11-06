export const LAO_WEEKDAY_LABELS = ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສຸ", "ສ"];
export const LAO_MONTH_LABELS = ["ມ.ກ.", "ກ.ພ.", "ມີ.ນ.", "ເມ.ສ.", "ພ.ພ.", "ມິ.ຖ.", "ກ.ລ.", "ສ.ຫ.", "ກ.ຍ.", "ຕ.ລ.", "ພ.ຈ.", "ທ.ວ."];

export type CalendarMonth = { year: number; month: number };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Dates stay as YYYY-MM-DD and use UTC arithmetic, so timezones cannot shift a day.
export function getCalendarMonth(date: string): CalendarMonth | null {
  const match = DATE_PATTERN.exec(date);
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}

export function shiftCalendarMonth({ year, month }: CalendarMonth, offset: number): CalendarMonth {
  const shifted = new Date(Date.UTC(year, month + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

// Sunday-first grid: leading nulls pad the first week.
export function buildCalendarCells({ year, month }: CalendarMonth): Array<string | null> {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10));
  }
  return cells;
}

export function formatCalendarDate(date: string) {
  const match = DATE_PATTERN.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
