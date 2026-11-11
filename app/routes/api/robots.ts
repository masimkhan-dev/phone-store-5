import { getEnv } from "~/lib/env.server";

export function loader() {
  const { siteUrl } = getEnv();
  const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
