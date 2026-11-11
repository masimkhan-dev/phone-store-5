import { z } from "zod";
import type { Route } from "./+types/track";
import { londonParts } from "~/lib/hours";
import { rateLimitKey, sessionHash } from "~/lib/request.server";
import { serviceClient } from "~/lib/supabase.server";

const schema = z.object({
  event: z.enum(["page_view", "call_click", "whatsapp_click", "directions_click", "quote_start"]),
  path: z.string().startsWith("/").max(300),
  branchId: z.string().uuid().nullish(),
  deviceType: z.string().max(60).nullish(),
  productId: z.string().uuid().nullish(),
});

// First-party event collector. Stores no personal data; quote_submit and reserve_submit
// are recorded by the server when the enquiry itself is saved, so they cannot be faked here.
export async function action({ request }: Route.ActionArgs) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  if (/bot|crawl|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });

  const db = serviceClient();
  const { data: allowed } = await db.rpc("check_rate_limit", { p_key_hash: rateLimitKey(request), p_form: "track", p_max: 120, p_window_seconds: 60 });
  if (!allowed) return new Response(null, { status: 429 });

  const { error } = await db.from("site_events").insert({
    event_type: parsed.data.event,
    branch_id: parsed.data.branchId ?? null,
    page_path: parsed.data.path,
    device_type: parsed.data.deviceType ?? null,
    product_id: parsed.data.productId ?? null,
    session_hash: sessionHash(request, londonParts(new Date()).date),
  });
  // An unknown branch id violates the foreign key; treat it as a bad request.
  return new Response(null, { status: error ? 400 : 204 });
}
