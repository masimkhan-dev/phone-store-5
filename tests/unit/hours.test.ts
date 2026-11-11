import { describe, expect, it } from "vitest";
import { isLateEnquiry, londonParts, openMinutesBetween, openStatus, openStatusLabel } from "~/lib/hours";
import type { BranchClosure, BranchHours } from "~/lib/types";

const hours: BranchHours[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ branch_id: "b", weekday, is_closed: false, opens_at: "09:00:00", closes_at: "17:30:00" }));
hours.push({ branch_id: "b", weekday: 7, is_closed: true, opens_at: null, closes_at: null });
const closures: BranchClosure[] = [{ id: "c", branch_id: "b", closed_on: "2026-12-25", reason: "Christmas Day" }];
const at = (iso: string) => new Date(iso);

describe("opening hours in Europe/London", () => {
  it("reads the London clock in winter (GMT) and summer (BST)", () => {
    expect(londonParts(at("2026-11-11T10:00:00Z"))).toEqual({ date: "2026-11-11", weekday: 3, minutes: 600 });
    // 23:30 UTC in July is 00:30 the next day in London.
    expect(londonParts(at("2026-07-01T23:30:00Z"))).toEqual({ date: "2026-07-02", weekday: 4, minutes: 30 });
  });
  it("reports open, with the closing time", () => {
    const status = openStatus(hours, closures, at("2026-11-11T10:00:00Z"));
    expect(status).toEqual({ known: true, open: true, closesAt: "5:30pm" });
    expect(openStatusLabel(status)).toBe("Open now, closes at 5:30pm");
  });
  it("uses London time, not UTC, in summer", () => {
    // 08:30 UTC = 09:30 BST: open. In UTC terms it would still be before 9.
    expect(openStatus(hours, closures, at("2026-07-01T08:30:00Z"))).toMatchObject({ open: true });
    // 16:45 UTC = 17:45 BST: closed.
    expect(openStatus(hours, closures, at("2026-07-01T16:45:00Z"))).toMatchObject({ open: false, reason: "after_close" });
  });
  it("reports closed before opening, after closing and on a closed day", () => {
    expect(openStatus(hours, closures, at("2026-11-11T08:00:00Z"))).toMatchObject({ open: false, reason: "before_open", opensAt: "9am" });
    expect(openStatus(hours, closures, at("2026-11-11T17:30:00Z"))).toMatchObject({ open: false, reason: "after_close" });
    expect(openStatus(hours, closures, at("2026-11-15T12:00:00Z"))).toMatchObject({ open: false, reason: "closed_today" });
  });
  it("lets a holiday closure override normal hours", () => {
    const status = openStatus(hours, closures, at("2026-12-25T12:00:00Z"));
    expect(status).toMatchObject({ open: false, reason: "holiday" });
    expect(openStatusLabel(status)).toBe("Closed today (Christmas Day)");
  });
  it("says nothing when no hours are configured", () => {
    expect(openStatus([], [], at("2026-11-11T10:00:00Z"))).toEqual({ known: false });
  });
});

describe("late enquiries: 30 minutes of opening hours", () => {
  it("counts only minutes while the branch is open", () => {
    expect(openMinutesBetween(at("2026-11-11T10:00:00Z"), at("2026-11-11T10:45:00Z"), hours, closures)).toBe(45);
    // Arrived 20:00 Wednesday, checked 09:20 Thursday: 20 open minutes.
    expect(openMinutesBetween(at("2026-11-11T20:00:00Z"), at("2026-11-12T09:20:00Z"), hours, closures)).toBe(20);
    // Saturday 17:20 to Monday 09:15, across a closed Sunday: 10 + 15.
    expect(openMinutesBetween(at("2026-11-14T17:20:00Z"), at("2026-11-16T09:15:00Z"), hours, closures)).toBe(25);
    // Across the Christmas closure.
    expect(openMinutesBetween(at("2026-12-24T17:00:00Z"), at("2026-12-26T09:10:00Z"), hours, closures)).toBe(40);
  });
  it("flags an enquiry only after more than 30 open minutes", () => {
    expect(isLateEnquiry("2026-11-11T10:00:00Z", hours, closures, at("2026-11-11T10:30:00Z"))).toBe(false);
    expect(isLateEnquiry("2026-11-11T10:00:00Z", hours, closures, at("2026-11-11T10:31:00Z"))).toBe(true);
    // An evening enquiry is not late overnight.
    expect(isLateEnquiry("2026-11-11T20:00:00Z", hours, closures, at("2026-11-12T08:59:00Z"))).toBe(false);
    expect(isLateEnquiry("2026-11-11T20:00:00Z", hours, closures, at("2026-11-12T09:31:00Z"))).toBe(true);
  });
});
