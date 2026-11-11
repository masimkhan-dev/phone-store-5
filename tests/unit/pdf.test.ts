import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { repairEntrySchema, previewTotals } from "~/modules/invoices/schema";
import type { InvoiceBundle } from "~/modules/invoices/data.server";
import { warrantyText } from "~/modules/invoices/format";
import { invoicePdf, tablePdf } from "~/services/pdf/invoice.server";

const bundle = {
  invoice: { id: "i", branch_id: "b", invoice_number: "TST-2026-00042", issued_at: "2026-11-11T10:00:00Z", issued_by_name: "Test Staff", customer_name: "Test Customer", customer_phone: "07000 000000", device_description: "TestBrand Model – “Pro”", imei: "350000000000001", warranty_days: 90, vat_mode: "standard", prices_include_vat: true, subtotal_pence: 8000, discount_kind: "percent", discount_percent_bp: 1000, discount_pence: 800, tax_pence: 1200, total_pence: 7200, cancelled_at: null, cancel_reason: null },
  lines: [{ id: "1", position: 1, description: "Screen replacement with a deliberately long description that has to wrap onto a second line on narrow thermal paper", quantity: 2, unit_price_pence: 2500, line_total_pence: 5000, tax_rate_bp: 2000, tax_pence: 750 }, { id: "2", position: 2, description: "Battery", quantity: 1, unit_price_pence: 3000, line_total_pence: 3000, tax_rate_bp: 2000, tax_pence: 450 }],
  payments: [{ id: "p", method: "cash", amount_pence: 4000, received_at: "2026-11-11T10:00:00Z" }],
  refunds: [], creditNotes: [],
  balance: { invoice_id: "i", branch_id: "b", invoice_number: "TST-2026-00042", issued_at: "", total_pence: 7200, credited_pence: 0, paid_pence: 4000, refunded_pence: 0, outstanding_pence: 3200, payment_status: "partially_paid" },
  branch: { name: "Test Branch", address_line1: "1 Test Street", address_line2: null, town: "Test Town", postcode: "T1 1AA", phone: "01000 000001" },
  settings: { business_name: "Test Business", legal_name: null, logo_path: null, vat_number: "GB000000000", vat_mode: "standard", default_warranty_text: "Fixture warranty wording.", invoice_terms: "Fixture terms.\nSecond line." },
} as unknown as InvoiceBundle;

describe("invoice PDF", () => {
  it("renders a one-page A4 invoice", async () => {
    const bytes = await invoicePdf(bundle, "a4");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
  });
  it("renders an 80mm thermal receipt cut to its content", async () => {
    const doc = await PDFDocument.load(await invoicePdf(bundle, "thermal_80mm"));
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth() / (72 / 25.4))).toBe(80);
    expect(page.getHeight()).toBeGreaterThan(250);
    expect(page.getHeight()).toBeLessThan(1200);
  });
  it("renders a cancelled invoice and a summary table", async () => {
    const cancelled = { ...bundle, invoice: { ...bundle.invoice, cancelled_at: "2026-11-11T11:00:00Z", cancel_reason: "Entered in error" } };
    expect((await invoicePdf(cancelled, "a4")).length).toBeGreaterThan(800);
    expect((await tablePdf("Monthly summary", "November 2026", ["Branch", "A", "B"], [["Test", "£1.00", "£2.00"], ["All", "£1.00", "£2.00"]], "Note")).length).toBeGreaterThan(800);
  });
});

describe("repair entry validation", () => {
  const base = { customer_name: "Test Customer", customer_phone: "07000 000000", device_model: "Model X", discount_kind: "none", payment_method: "cash", paid_in_full: "on", lines: [{ description: "Screen", quantity: "2", unit_price_pence: "25.00" }] };
  it("converts lines to integer pence and defaults to paid in full", () => {
    const r = repairEntrySchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.lines[0]).toEqual({ description: "Screen", quantity: 2, unit_price_pence: 2500 });
      expect(r.data.paid_in_full).toBe(true);
      expect(r.data.payment_amount_pence).toBeNull();
    }
  });
  it("needs at least one charge line and valid prices", () => {
    expect(repairEntrySchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(repairEntrySchema.safeParse({ ...base, lines: [{ description: "x", quantity: "1", unit_price_pence: "abc" }] }).success).toBe(false);
    expect(repairEntrySchema.safeParse({ ...base, lines: [{ description: "x", quantity: "0", unit_price_pence: "1" }] }).success).toBe(false);
  });
  it("reads discounts as pence or basis points", () => {
    const amount = repairEntrySchema.safeParse({ ...base, discount_kind: "amount", discount_value: "5.50" });
    expect(amount.success && amount.data.discount_value).toBe(550);
    const percent = repairEntrySchema.safeParse({ ...base, discount_kind: "percent", discount_value: "12.5" });
    expect(percent.success && percent.data.discount_value).toBe(1250);
    expect(repairEntrySchema.safeParse({ ...base, discount_kind: "percent", discount_value: "101" }).success).toBe(false);
  });
  it("takes a part payment when not paid in full", () => {
    const r = repairEntrySchema.safeParse({ ...base, paid_in_full: undefined, payment_amount: "10" });
    expect(r.success && r.data.payment_amount_pence).toBe(1000);
    const unpaid = repairEntrySchema.safeParse({ ...base, paid_in_full: undefined, payment_amount: "" });
    expect(unpaid.success && unpaid.data.payment_amount_pence).toBe(0);
  });
  it("previews the same totals the database tests expect", () => {
    const lines = [{ quantity: 2, unit_price_pence: 2500 }, { quantity: 1, unit_price_pence: 3000 }];
    expect(previewTotals(lines, "percent", 1000, { rateBp: 0, inclusive: true })).toEqual({ subtotal: 8000, discount: 800, total: 7200 });
    expect(previewTotals(lines, "amount", 99999, { rateBp: 0, inclusive: true }).total).toBe(0);
  });
  it("describes warranty in months or days", () => {
    expect(warrantyText(90)).toBe("3 months warranty");
    expect(warrantyText(30)).toBe("1 month warranty");
    expect(warrantyText(14)).toBe("14 days warranty");
    expect(warrantyText(null)).toBeNull();
  });
});
