import type { BranchClosure, BranchHours } from "./types";

// Opening-hours logic. Everything is evaluated in the business timezone,
// whatever timezone the server or the visitor is in.
const TZ = "Europe/London";

type LondonParts = { date: string; weekday: number; minutes: number };

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function londonParts(at: Date): LondonParts {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday!) + 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h! >= 12 ? "pm" : "am";
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** The opening window for a London calendar date, or null when closed that day. */
function windowFor(date: string, weekday: number, hours: BranchHours[], closures: BranchClosure[]): { open: number; close: number } | null {
  if (closures.some((c) => c.closed_on === date)) return null;
  const day = hours.find((h) => h.weekday === weekday);
  if (!day || day.is_closed || !day.opens_at || !day.closes_at) return null;
  return { open: toMinutes(day.opens_at), close: toMinutes(day.closes_at) };
}

export type OpenStatus =
  | { known: false }
  | { known: true; open: true; closesAt: string }
  | { known: true; open: false; reason: "holiday" | "closed_today" | "before_open" | "after_close"; opensAt?: string; note?: string };

/** Live Open / Closed status. Holiday closures override normal hours. */
export function openStatus(hours: BranchHours[], closures: BranchClosure[], now: Date = new Date()): OpenStatus {
  if (hours.length === 0) return { known: false };
  const { date, weekday, minutes } = londonParts(now);
  const closure = closures.find((c) => c.closed_on === date);
  if (closure) return { known: true, open: false, reason: "holiday", note: closure.reason ?? undefined };
  const day = hours.find((h) => h.weekday === weekday);
  if (!day || day.is_closed || !day.opens_at || !day.closes_at) return { known: true, open: false, reason: "closed_today" };
  if (minutes < toMinutes(day.opens_at)) return { known: true, open: false, reason: "before_open", opensAt: formatTime(day.opens_at) };
  if (minutes >= toMinutes(day.closes_at)) return { known: true, open: false, reason: "after_close" };
  return { known: true, open: true, closesAt: formatTime(day.closes_at) };
}

export function openStatusLabel(status: OpenStatus): string | null {
  if (!status.known) return null;
  if (status.open) return `Open now, closes at ${status.closesAt}`;
  if (status.reason === "holiday") return status.note ? `Closed today (${status.note})` : "Closed today";
  if (status.reason === "before_open") return `Closed now, opens at ${status.opensAt}`;
  return status.reason === "after_close" ? "Closed now" : "Closed today";
}

/**
 * Minutes of opening time that have passed between two instants. Used to decide
 * whether a New enquiry has waited more than 30 minutes of opening hours.
 * Walks day by day, so nights, closed days and holidays count for nothing.
 */
export function openMinutesBetween(from: Date, to: Date, hours: BranchHours[], closures: BranchClosure[]): number {
  if (to <= from) return 0;
  let total = 0;
  const start = londonParts(from);
  const end = londonParts(to);
  // At most two weeks: anything older is late regardless.
  let cursor = new Date(from);
  for (let i = 0; i < 15; i++) {
    const day = londonParts(cursor);
    const window = windowFor(day.date, day.weekday, hours, closures);
    if (window) {
      const lower = day.date === start.date ? Math.max(window.open, start.minutes) : window.open;
      const upper = day.date === end.date ? Math.min(window.close, end.minutes) : window.close;
      if (upper > lower) total += upper - lower;
    }
    if (day.date === end.date) break;
    // Step to the next London day (noon avoids daylight-saving edges).
    cursor = new Date(Date.parse(`${day.date}T12:00:00Z`) + 24 * 60 * 60 * 1000);
  }
  return total;
}

/** With no hours configured we fall back to wall-clock minutes. */
export function isLateEnquiry(createdAt: string, hours: BranchHours[], closures: BranchClosure[], now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (hours.length === 0) return now.getTime() - created.getTime() > 30 * 60 * 1000;
  return openMinutesBetween(created, now, hours, closures) > 30;
}
