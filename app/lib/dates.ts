import { londonParts } from "./hours";

// Report date ranges, as inclusive London calendar days (YYYY-MM-DD).

export const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["last30", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom range"],
] as const;
export type Preset = (typeof PRESETS)[number][0];

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(preset: string | null, from: string | null, to: string | null, now: Date = new Date()): { preset: Preset; from: string; to: string } {
  const today = londonParts(now).date;
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday":
      return { preset, from: addDays(today, -1), to: addDays(today, -1) };
    case "last30":
      return { preset, from: addDays(today, -29), to: today };
    case "this_month":
      return { preset, from: monthStart, to: today };
    case "last_month": {
      const lastOfPrevious = addDays(monthStart, -1);
      return { preset, from: `${lastOfPrevious.slice(0, 8)}01`, to: lastOfPrevious };
    }
    case "custom":
      if (from && to && ISO_DAY.test(from) && ISO_DAY.test(to) && from <= to) return { preset, from, to };
      return { preset: "last7", from: addDays(today, -6), to: today };
    default:
      return { preset: "last7", from: addDays(today, -6), to: today };
  }
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / (60 * 24))} d ago`;
}

/** Full date with the year, for invoices: "11 Nov 2026, 10:42". */
export function formatInvoiceDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
