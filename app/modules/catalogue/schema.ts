import { z } from "zod";
import { parsePounds } from "~/lib/money";

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).optional().transform((v) => (v ? v : null));
const optionalInt = (min: number, max: number, message: string) =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return n;
  });

export const productSchema = z.object({
  category: z.enum(["new_phone", "used_phone", "accessory", "sim"]),
  brand: text(60).min(1, "Enter the brand"),
  model: text(80).min(1, "Enter the model"),
  storage: optional(40),
  colour: optional(40),
  condition_grade: optional(20),
  battery_health_pct: optionalInt(0, 100, "Battery health is a whole number from 0 to 100"),
  price: z.string().transform((v, ctx) => {
    const pence = parsePounds(v);
    if (pence === null) {
      ctx.addIssue({ code: "custom", message: "Enter the price in pounds, for example 199 or 199.99" });
      return z.NEVER;
    }
    return pence;
  }),
  warranty_months: optionalInt(0, 120, "Warranty is a whole number of months"),
  description: optional(2000),
  imei: optional(40),
  status: z.enum(["available", "reserved", "sold", "hidden"]),
});

export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 6;

export function slugify(parts: (string | null)[], suffix: string): string {
  const base = parts.filter(Boolean).join(" ").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return `${base || "item"}-${suffix}`;
}
