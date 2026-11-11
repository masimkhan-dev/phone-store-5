import { getEnv } from "~/lib/env.server";
import { publicClient } from "~/lib/supabase.server";

const STATIC = ["/", "/repairs", "/shop", "/sell-your-phone", "/unlocking", "/reviews", "/faq", "/about", "/contact", "/privacy", "/cookies", "/terms"];

export async function loader() {
  const { siteUrl } = getEnv();
  const db = publicClient();
  const [branches, services, products] = await Promise.all([
    db.from("branches").select("slug").eq("is_active", true).returns<{ slug: string }[]>(),
    db.from("services").select("slug").eq("is_active", true).returns<{ slug: string }[]>(),
    db.from("products").select("slug").eq("status", "available").returns<{ slug: string }[]>(),
  ]);
  const paths = [
    ...STATIC,
    ...(branches.data ?? []).map((b) => `/${b.slug}`),
    ...(branches.data ?? []).flatMap((b) => (services.data ?? []).map((s) => `/${b.slug}/${s.slug}`)),
    ...(products.data ?? []).map((p) => `/shop/${p.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
