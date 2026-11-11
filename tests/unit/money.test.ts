import { describe, expect, it } from "vitest";
import { formatPence, formatPenceExact, parsePounds } from "~/lib/money";

describe("money", () => {
  it("formats whole pounds without decimals and pence with two", () => {
    expect(formatPence(2500)).toBe("£25");
    expect(formatPence(2550)).toBe("£25.50");
    expect(formatPence(125000)).toBe("£1,250");
    expect(formatPence(-105)).toBe("-£1.05");
    expect(formatPenceExact(2500)).toBe("£25.00");
  });
  it("parses typed amounts into integer pence without floating point", () => {
    expect(parsePounds("25")).toBe(2500);
    expect(parsePounds("25.5")).toBe(2550);
    expect(parsePounds("£1,250.00")).toBe(125000);
    expect(parsePounds("0.07")).toBe(7);
    // 0.1 + 0.2 style inputs must not drift.
    expect(parsePounds("19.99")).toBe(1999);
    expect(parsePounds("1.15")).toBe(115);
  });
  it("rejects anything that is not a non-negative amount with at most two decimals", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,5", "1e3", " "]) expect(parsePounds(bad)).toBeNull();
  });
});
