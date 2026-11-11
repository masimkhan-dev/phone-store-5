import { z } from "zod";

// One schema per enquiry type, shared by the form and the server.

const name = z.string().trim().min(2, "Enter your name").max(100);
const phone = z
  .string()
  .trim()
  .refine((v) => /^[0-9+() -]{7,20}$/.test(v) && v.replace(/[^0-9]/g, "").length >= 9, "Enter a phone number we can reach you on");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const email = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address, or leave it empty");

const common = {
  branch_id: z.string().uuid("Choose a branch"),
  customer_name: name,
  customer_phone: phone,
  customer_email: email,
  message: optionalText(2000),
  marketing_consent: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  source_url: optionalText(500),
  landing_page: optionalText(500),
  utm_source: optionalText(100),
  utm_medium: optionalText(100),
  utm_campaign: optionalText(100),
};

export const enquirySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("repair_quote"),
    ...common,
    device_type: z.string().trim().min(1, "Choose a device").max(60),
    device_model: optionalText(100),
    fault: z.string().trim().min(1, "Choose what's wrong").max(120),
    service_id: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Unknown service"),
  }),
  z.object({
    type: z.literal("reserve_collect"),
    ...common,
    product_id: z.string().uuid("Unknown product"),
  }),
  z.object({
    type: z.literal("sell_phone"),
    ...common,
    device_model: z.string().trim().min(2, "Tell us the make and model").max(100),
    storage: optionalText(40),
    condition: z.string().trim().min(1, "Choose the condition").max(60),
  }),
  z.object({
    type: z.literal("general"),
    ...common,
    message: z.string().trim().min(5, "Tell us how we can help").max(2000),
  }),
]);

export type EnquiryInput = z.infer<typeof enquirySchema>;

export const SELL_CONDITIONS = ["Like new", "Good", "Fair", "Cracked or damaged", "Not working"] as const;
