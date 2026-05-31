import dayjs from "dayjs";

/**
 * Converts an instant to the user's calendar date (YYYY-MM-DD).
 * @param timezoneOffsetMinutes Same as `Date.getTimezoneOffset()` (e.g. 180 for UTC-3).
 */
export function toUserDateKey(instant: Date, timezoneOffsetMinutes: number): string {
  const localMs = instant.getTime() - timezoneOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday–Sunday date keys for the week that contains `calendarDate` (YYYY-MM-DD). */
export function getMondayWeekDateKeys(calendarDate: string): string[] {
  const current = dayjs(calendarDate);
  const dayOfWeek = current.day();
  const monday =
    dayOfWeek === 0 ? current.subtract(6, "day") : current.subtract(dayOfWeek - 1, "day");

  return Array.from({ length: 7 }, (_, i) => monday.add(i, "day").format("YYYY-MM-DD"));
}

/** UTC range covering one full calendar day in the user's timezone. */
export function userDateToUtcRange(
  dateKey: string,
  timezoneOffsetMinutes: number,
): { start: Date; end: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) + timezoneOffsetMinutes * 60_000;
  const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) + timezoneOffsetMinutes * 60_000;
  return { start: new Date(startMs), end: new Date(endMs) };
}

export function getWeekUtcRange(
  calendarDate: string,
  timezoneOffsetMinutes: number,
): { start: Date; end: Date } {
  const weekKeys = getMondayWeekDateKeys(calendarDate);
  const start = userDateToUtcRange(weekKeys[0], timezoneOffsetMinutes).start;
  const end = userDateToUtcRange(weekKeys[6], timezoneOffsetMinutes).end;
  return { start, end };
}
