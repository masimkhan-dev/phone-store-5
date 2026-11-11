import type { Route } from "./+types/customer-lookup";
import { requireUser } from "~/lib/auth.server";

// Returning-customer lookup for the repair entry screen. Row Level Security limits it to the user's branch.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = await requireUser(request);
  const url = new URL(request.url);
  const digits = (url.searchParams.get("phone") ?? "").replace(/[^0-9]/g, "").replace(/^44/, "0");
  if (digits.length < 9) return Response.json({ name: null }, { headers });
  let query = supabase.from("customers").select("name").eq("phone_normalised", digits).is("erased_at", null).limit(1);
  const branch = url.searchParams.get("branch");
  if (branch) query = query.eq("branch_id", branch);
  const { data } = await query.returns<{ name: string }[]>();
  return Response.json({ name: data?.[0]?.name ?? null }, { headers });
}
