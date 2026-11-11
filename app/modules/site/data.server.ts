import { redirect } from "react-router";
import { publicClient } from "~/lib/supabase.server";
import type { Banner, BranchWithHours, Faq, PublicProduct, PublicSettings, ServiceWithPrices } from "~/lib/types";

// Read-only queries for the public website. All run with visitor-level access.

const PRODUCT_COLUMNS =
  "id, branch_id, slug, category, brand, model, storage, colour, condition_grade, battery_health_pct, price_pence, warranty_months, description, status, created_at, product_photos(id, storage_path, sort_order)";

function fail(context: string, error: { message: string } | null): never {
  console.error(`${context}: ${error?.message ?? "unknown error"}`);
  throw new Response("We could not load this page. Please try again.", { status: 500 });
}

export async function getSiteShell(): Promise<{ settings: PublicSettings; branches: BranchWithHours[]; banner: Banner | null }> {
  const db = publicClient();
  const now = new Date().toISOString();
  const [settings, branches, banners] = await Promise.all([
    db.from("business_settings").select("business_name, logo_path, tagline, region, no_fix_no_fee_text, default_warranty_text, ga4_measurement_id").single<PublicSettings>(),
    db.from("branches").select("*, branch_hours(*), branch_closures(*)").eq("is_active", true).order("sort_order").order("town").returns<BranchWithHours[]>(),
    db.from("banners").select("*").eq("is_active", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("created_at", { ascending: false }).limit(1).returns<Banner[]>(),
  ]);
  if (settings.error || !settings.data) fail("settings", settings.error);
  if (branches.error) fail("branches", branches.error);
  return { settings: settings.data, branches: branches.data ?? [], banner: banners.data?.[0] ?? null };
}

export async function getServices(): Promise<ServiceWithPrices[]> {
  const { data, error } = await publicClient()
    .from("services")
    .select("*, service_prices(*)")
    .eq("is_active", true)
    .order("sort_order")
    .order("name")
    .returns<ServiceWithPrices[]>();
  if (error) fail("services", error);
  return data ?? [];
}

export async function getFaqs(serviceId?: string): Promise<Faq[]> {
  let query = publicClient().from("faqs").select("*").eq("is_published", true).order("sort_order");
  if (serviceId) query = query.or(`service_id.is.null,service_id.eq.${serviceId}`);
  const { data, error } = await query.returns<Faq[]>();
  if (error) fail("faqs", error);
  return data ?? [];
}

export async function getProducts(filter: { branchId?: string; category?: string; limit?: number } = {}): Promise<PublicProduct[]> {
  let query = publicClient().from("products").select(PRODUCT_COLUMNS).eq("status", "available").order("created_at", { ascending: false });
  if (filter.branchId) query = query.eq("branch_id", filter.branchId);
  if (filter.category) query = query.eq("category", filter.category);
  if (filter.limit) query = query.limit(filter.limit);
  const { data, error } = await query.returns<PublicProduct[]>();
  if (error) fail("products", error);
  return data ?? [];
}

export async function getProduct(slug: string): Promise<PublicProduct | null> {
  const { data, error } = await publicClient().from("products").select(PRODUCT_COLUMNS).eq("slug", slug).eq("status", "available").maybeSingle<PublicProduct>();
  if (error) fail("product", error);
  return data;
}

/** A path nothing matched: honour the redirect map (301), otherwise 404. */
export async function redirectOrNotFound(request: Request): Promise<never> {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const { data } = await publicClient().from("redirects").select("to_path").eq("from_path", path).maybeSingle<{ to_path: string }>();
  if (data) throw redirect(data.to_path, 301);
  throw new Response("Page not found", { status: 404 });
}

export function photoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/product-photos/${path}`;
}
