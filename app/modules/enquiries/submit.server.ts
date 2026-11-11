import { rateLimitKey, sessionHash } from "~/lib/request.server";
import { londonParts } from "~/lib/hours";
import { serviceClient } from "~/lib/supabase.server";
import type { Branch, Enquiry } from "~/lib/types";
import { notifyBranch } from "./notify.server";
import { enquirySchema } from "./schema";

export type EnquiryActionResult =
  | { ok: true; type: string; branchName: string }
  | { ok: false; formError?: string; fieldErrors: Record<string, string>; values: Record<string, string> };

/**
 * Handles every public enquiry form. Validation, spam protection and the write
 * all happen here on the server; the browser is never trusted.
 */
export async function submitEnquiry(request: Request, formData: FormData): Promise<EnquiryActionResult> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;

  // Honeypot: a field people never see. A filled one gets a normal-looking answer and no record.
  if (values.company) return { ok: true, type: values.type ?? "general", branchName: "" };

  const parsed = enquirySchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors, values };
  }
  const input = parsed.data;
  const db = serviceClient();

  const { data: allowed, error: limitError } = await db.rpc("check_rate_limit", {
    p_key_hash: rateLimitKey(request),
    p_form: "enquiry",
    p_max: 5,
    p_window_seconds: 600,
  });
  if (limitError) return { ok: false, formError: "We could not send that. Please try again, or call the branch.", fieldErrors: {}, values };
  if (!allowed) {
    return { ok: false, formError: "You have sent several requests in a short time. Please call the branch instead.", fieldErrors: {}, values };
  }

  const { data: branch } = await db
    .from("branches")
    .select("id, name, email")
    .eq("id", input.branch_id)
    .eq("is_active", true)
    .maybeSingle<Pick<Branch, "id" | "name" | "email">>();
  if (!branch) return { ok: false, fieldErrors: { branch_id: "Choose a branch" }, values };

  // A reservation must be for an item that is on sale at that branch right now.
  if (input.type === "reserve_collect") {
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("id", input.product_id)
      .eq("branch_id", branch.id)
      .eq("status", "available")
      .maybeSingle();
    if (!product) return { ok: false, formError: "Sorry, that item is no longer available.", fieldErrors: {}, values };
  }

  const { data: enquiry, error } = await db
    .from("enquiries")
    .insert({ ...input })
    .select("*")
    .single<Enquiry>();
  if (error || !enquiry) {
    console.error("enquiry insert failed", error);
    return { ok: false, formError: "We could not send that. Your details are still here, so please try again.", fieldErrors: {}, values };
  }

  const eventType = input.type === "repair_quote" ? "quote_submit" : input.type === "reserve_collect" ? "reserve_submit" : null;
  if (eventType) {
    const path = safePath(input.source_url) ?? "/";
    await db.from("site_events").insert({
      event_type: eventType,
      branch_id: branch.id,
      page_path: path,
      device_type: input.type === "repair_quote" ? input.device_type : null,
      product_id: input.type === "reserve_collect" ? input.product_id : null,
      session_hash: sessionHash(request, londonParts(new Date()).date),
    });
  }

  const notified = await notifyBranch(branch, enquiry);
  if (!notified.sent) console.warn(`enquiry ${enquiry.id}: alert email not sent (${notified.reason})`);

  return { ok: true, type: input.type, branchName: branch.name };
}

function safePath(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://placeholder.invalid").pathname.slice(0, 300);
  } catch {
    return null;
  }
}
