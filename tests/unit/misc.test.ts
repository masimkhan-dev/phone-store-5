import { describe, expect, it } from "vitest";
import { directionsHref, telHref, toInternational, whatsappHref } from "~/lib/contact";
import { toCsv } from "~/lib/csv";
import { resolveRange } from "~/lib/dates";
import { branchJsonLd } from "~/lib/seo";
import type { BranchWithHours } from "~/lib/types";
import { productSchema, slugify } from "~/modules/catalogue/schema";
import { enquirySchema } from "~/modules/enquiries/schema";
import { decorate } from "~/modules/enquiries/inbox.server";
import { percent, totals, type AcquisitionRow } from "~/modules/reporting/acquisition.server";

const BRANCH = "0b0e6a52-6f0c-4d1e-9f0a-6c1f0f1f2a01";
const base = { branch_id: BRANCH, customer_name: "Test Person", customer_phone: "07000 000000" };

describe("contact links", () => {
  it("builds dialler and WhatsApp links for UK numbers", () => {
    expect(telHref("01234 567 890")).toBe("tel:01234567890");
    expect(toInternational("07123 456789")).toBe("447123456789");
    expect(toInternational("+44 7123 456789")).toBe("447123456789");
    expect(whatsappHref("07123 456789", "Screen & battery")).toBe("https://wa.me/447123456789?text=Screen%20%26%20battery");
    expect(directionsHref({ name: "A", address_line1: "1 St", postcode: "T1 1AA", google_place_id: "abc" })).toContain("destination_place_id=abc");
  });
});

describe("enquiry validation", () => {
  it("accepts a repair quote and normalises empty optionals to null", () => {
    const r = enquirySchema.safeParse({ ...base, type: "repair_quote", device_type: "Phone", fault: "Screen repair", device_model: "", service_id: "", customer_email: "" });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "repair_quote") {
      expect(r.data.device_model).toBeNull();
      expect(r.data.service_id).toBeNull();
      expect(r.data.customer_email).toBeNull();
      expect(r.data.marketing_consent).toBe(false);
    }
  });
  it("requires the fields each enquiry type needs", () => {
    expect(enquirySchema.safeParse({ ...base, type: "repair_quote", device_type: "Phone", fault: "" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, type: "reserve_collect" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, type: "sell_phone", device_model: "Model X", condition: "" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, type: "general", message: "" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, type: "general", message: "Do you unlock phones?" }).success).toBe(true);
  });
  it("rejects bad phones, bad emails, unknown types and non-UUID branches", () => {
    const ok = { ...base, type: "general", message: "Hello there" };
    expect(enquirySchema.safeParse({ ...ok, customer_phone: "12" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...ok, customer_phone: "call me maybe" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...ok, customer_email: "not-an-email" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...ok, branch_id: "branch-1" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...ok, type: "invoice" }).success).toBe(false);
  });
  it("only records marketing consent when the box was ticked", () => {
    const r = enquirySchema.safeParse({ ...base, type: "general", message: "Hello there", marketing_consent: "on" });
    expect(r.success && r.data.marketing_consent).toBe(true);
  });
});

describe("catalogue validation", () => {
  const product = { category: "used_phone", brand: "Brand", model: "Model", price: "199.99", status: "available" };
  it("converts the typed price to pence", () => {
    const r = productSchema.safeParse(product);
    expect(r.success && r.data.price).toBe(19999);
  });
  it("rejects a bad price or battery percentage", () => {
    expect(productSchema.safeParse({ ...product, price: "free" }).success).toBe(false);
    expect(productSchema.safeParse({ ...product, battery_health_pct: "140" }).success).toBe(false);
  });
  it("builds URL-safe slugs", () => {
    expect(slugify(["Brand", "Model Pro+", "256GB", null], "a1b2c3")).toBe("brand-model-pro-256gb-a1b2c3");
    expect(slugify([null], "x")).toBe("item-x");
  });
});

describe("report date ranges (London days, inclusive)", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  it("resolves each preset", () => {
    expect(resolveRange("today", null, null, now)).toMatchObject({ from: "2026-11-11", to: "2026-11-11" });
    expect(resolveRange("yesterday", null, null, now)).toMatchObject({ from: "2026-11-10", to: "2026-11-10" });
    expect(resolveRange("last7", null, null, now)).toMatchObject({ from: "2026-11-05", to: "2026-11-11" });
    expect(resolveRange("last30", null, null, now)).toMatchObject({ from: "2026-10-13", to: "2026-11-11" });
    expect(resolveRange("this_month", null, null, now)).toMatchObject({ from: "2026-11-01", to: "2026-11-11" });
    expect(resolveRange("last_month", null, null, now)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("uses the London date just after midnight in summer", () => {
    expect(resolveRange("today", null, null, new Date("2026-07-01T23:30:00Z"))).toMatchObject({ from: "2026-07-02" });
  });
  it("falls back to the last 7 days for a bad custom range", () => {
    expect(resolveRange("custom", "2026-11-01", "2026-11-05", now)).toMatchObject({ preset: "custom", from: "2026-11-01", to: "2026-11-05" });
    expect(resolveRange("custom", "2026-11-09", "2026-11-01", now).preset).toBe("last7");
    expect(resolveRange("custom", "'; drop", "x", now).preset).toBe("last7");
  });
});

describe("csv", () => {
  it("quotes where needed and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a", 1, null], ['say "hi"', "x,y", "=SUM(A1)"]])).toBe('a,1,\r\n"say ""hi""","x,y",\'=SUM(A1)');
  });
});

describe("structured data", () => {
  const branch = {
    id: BRANCH, slug: "test-a", town: "Test A", phone: "01000 000001", email: null, address_line1: "1 Test Street", address_line2: null, postcode: "T1 1AA",
    latitude: 53.5, longitude: -2.9, google_rating: 4.8, google_review_count: 120, google_rating_verified_at: null,
    branch_hours: [{ branch_id: BRANCH, weekday: 1, is_closed: false, opens_at: "09:00:00", closes_at: "17:30:00" }, { branch_id: BRANCH, weekday: 7, is_closed: true, opens_at: null, closes_at: null }],
    branch_closures: [],
  } as unknown as BranchWithHours;
  it("describes a MobilePhoneStore with address, geo and hours", () => {
    const ld = branchJsonLd(branch, "Test Business", "https://example.test");
    expect(ld["@type"]).toBe("MobilePhoneStore");
    expect(ld.address.addressCountry).toBe("GB");
    expect(ld.geo).toEqual({ "@type": "GeoCoordinates", latitude: 53.5, longitude: -2.9 });
    expect(ld.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:30" }]);
  });
  it("never publishes a rating that has not been verified", () => {
    expect(branchJsonLd(branch, "Test Business", "https://example.test")).not.toHaveProperty("aggregateRating");
    expect(branchJsonLd({ ...branch, google_rating_verified_at: "2026-11-01T00:00:00Z" }, "Test Business", "https://example.test")).toHaveProperty("aggregateRating");
  });
});

describe("inbox flags and report totals", () => {
  it("flags Quoted enquiries with no update for 24 hours", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const make = (status: string, changed: string) => ({ id: status + changed, branch_id: BRANCH, status, created_at: changed, status_changed_at: changed }) as never;
    const rows = decorate([make("quoted", "2026-11-10T11:00:00Z"), make("quoted", "2026-11-11T09:00:00Z"), make("contacted", "2026-11-01T09:00:00Z")], [], now);
    expect(rows.map((r) => r.followUp)).toEqual([true, false, false]);
  });
  it("makes the consolidated figure the sum of the branch figures", () => {
    const row = (n: number) => ({ sessions: 100 * n, call_clicks: n, whatsapp_clicks: n, directions_clicks: n, quote_starts: n, quote_submits: n, reserve_submits: n, enquiries: 2 * n, converted: n, late_enquiries: 0, enquiry_actions: 3 * n }) as AcquisitionRow;
    const sum = totals([row(1), row(2), row(3)]);
    expect(sum.sessions).toBe(600);
    expect(sum.enquiry_actions).toBe(18);
    expect(percent(sum.enquiry_actions, sum.sessions)).toBe("3.0%");
    expect(percent(1, 0)).toBe("n/a");
  });
});
