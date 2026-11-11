import { z } from "zod";
import { parsePounds } from "~/lib/money";

const pounds = (message: string) =>
  z.string().transform((v, ctx) => {
    const pence = parsePounds(v);
    if (pence === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return pence;
  });

export const repairEntrySchema = z
  .object({
    customer_name: z.string().trim().min(2, "Enter the customer's name").max(100),
    customer_phone: z.string().trim().refine((v) => v.replace(/[^0-9]/g, "").length >= 9, "Enter the customer's phone number"),
    device_brand: z.string().trim().max(60).optional().transform((v) => v || null),
    device_model: z.string().trim().min(1, "Enter the device model").max(100),
    imei: z.string().trim().max(40).optional().transform((v) => v || null),
    warranty_days: z.string().trim().optional().transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 3650) {
        ctx.addIssue({ code: "custom", message: "Warranty is a whole number of days" });
        return z.NEVER;
      }
      return n;
    }),
    internal_parts_cost: z.string().trim().optional().transform((v, ctx) => {
      if (!v) return null;
      const pence = parsePounds(v);
      if (pence === null) {
        ctx.addIssue({ code: "custom", message: "Enter the parts cost in pounds" });
        return z.NEVER;
      }
      return pence;
    }),
    enquiry_id: z.string().optional().transform((v) => v || null),
    discount_kind: z.enum(["none", "amount", "percent"]),
    discount_value: z.string().trim().optional(),
    payment_method: z.enum(["cash", "card", "bank_transfer"]),
    paid_in_full: z.string().optional().transform((v) => v === "on"),
    payment_amount: z.string().trim().optional(),
    lines: z
      .array(z.object({ description: z.string().trim().min(1, "Describe each charge").max(200), quantity: z.coerce.number().int("Quantity is a whole number").min(1, "Quantity is at least 1").max(999), unit_price_pence: pounds("Enter each price in pounds, for example 49.99") }))
      .min(1, "Add at least one charge line"),
  })
  .transform((v, ctx) => {
    // Discount: pence for an amount, basis points for a percentage (10% = 1000).
    let discountValue = 0;
    if (v.discount_kind === "amount") {
      const pence = parsePounds(v.discount_value ?? "");
      if (pence === null) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Enter the discount in pounds" });
        return z.NEVER;
      }
      discountValue = pence;
    } else if (v.discount_kind === "percent") {
      const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(v.discount_value ?? "");
      const bp = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || 0) : NaN;
      if (!match || bp > 10000) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Enter a percentage from 0 to 100" });
        return z.NEVER;
      }
      discountValue = bp;
    }
    let paymentAmount: number | null = null;
    if (!v.paid_in_full) {
      paymentAmount = parsePounds(v.payment_amount || "0");
      if (paymentAmount === null) {
        ctx.addIssue({ code: "custom", path: ["payment_amount"], message: "Enter the amount paid in pounds, or 0 if nothing was paid" });
        return z.NEVER;
      }
    }
    return { ...v, discount_value: discountValue, payment_amount_pence: paymentAmount };
  });

export type RepairEntry = z.infer<typeof repairEntrySchema>;

/**
 * The invoice total as the database will compute it, for the "paid in full" amount and the
 * on-screen preview. The database remains the authority: it recomputes and stores the figures.
 */
export function previewTotals(lines: { quantity: number; unit_price_pence: number }[], kind: "none" | "amount" | "percent", value: number, vat: { rateBp: number; inclusive: boolean }) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price_pence, 0);
  // Integer arithmetic with round-half-up, matching round() in PostgreSQL for positive values.
  const discount = kind === "amount" ? value : kind === "percent" ? Math.floor((subtotal * value + 5000) / 10000) : 0;
  const net = subtotal - Math.min(discount, subtotal);
  const total = vat.rateBp > 0 && !vat.inclusive ? net + Math.floor((net * vat.rateBp + 5000) / 10000) : net;
  return { subtotal, discount: Math.min(discount, subtotal), total };
}
