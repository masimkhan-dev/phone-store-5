// Stand-in for the Supabase REST API, for browser smoke tests only. It serves a handful
// of obviously fake fixtures so pages can be rendered without a database. It is never
// used by the application itself and proves nothing about Row Level Security: that is
// covered by tests/db against real PostgreSQL.
import { createServer } from "node:http";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";
const hours = (id) => [1, 2, 3, 4, 5, 6].map((weekday) => ({ branch_id: id, weekday, is_closed: false, opens_at: "09:00:00", closes_at: "17:30:00" })).concat([{ branch_id: id, weekday: 7, is_closed: true, opens_at: null, closes_at: null }]);
const branch = (id, slug, town, n) => ({
  id, slug, code: `EX${n}`, name: `Example ${town}`, town, address_line1: `${n} Example Street`, address_line2: null, postcode: `EX${n} ${n}AA`,
  latitude: 53.5, longitude: -2.9, phone: `01000 00000${n}`, whatsapp: `07000 00000${n}`, email: null, google_place_id: null, google_review_url: null,
  google_rating: null, google_review_count: null, google_rating_verified_at: null, intro: null, print_layout: "a4", default_warranty_days: null, is_active: true, sort_order: n,
  branch_hours: hours(id), branch_closures: [{ id: `c${n}`, branch_id: id, closed_on: "2099-12-25", reason: "Christmas Day" }],
});
const tables = {
  business_settings: [{ business_name: "Example Phones (test fixture)", logo_path: null, tagline: null, region: null, no_fix_no_fee_text: "Fixture: no fix, no fee wording.", default_warranty_text: null, ga4_measurement_id: null }],
  branches: [branch(B1, "example-town", "Example Town", 1), branch(B2, "sample-city", "Sample City", 2)],
  banners: [{ id: "b", message: "Fixture promo banner", link_url: "/repairs", link_label: "See prices", is_active: true, starts_at: null, ends_at: null }],
  services: [
    { id: S1, slug: "screen-repair", name: "Screen repair", short_description: "Fixture description.", description: null, seo_text: null, is_active: true, sort_order: 1, service_prices: [{ id: "p1", service_id: S1, device_type: "Phone", from_price_pence: 1234, turnaround: "fixture time" }, { id: "p2", service_id: S1, device_type: "Tablet", from_price_pence: 5678, turnaround: null }] },
    { id: S2, slug: "battery-replacement", name: "Battery replacement", short_description: null, description: null, seo_text: null, is_active: true, sort_order: 2, service_prices: [{ id: "p3", service_id: S2, device_type: "Phone", from_price_pence: 999, turnaround: null }] },
  ],
  faqs: [{ id: "f1", question: "Fixture question?", answer: "Fixture answer.", service_id: null, is_published: true, sort_order: 1 }],
  products: [{ id: "55555555-5555-4555-8555-555555555555", branch_id: B1, slug: "fixture-phone", category: "used_phone", brand: "Fixture", model: "Phone One", storage: "64GB", colour: "Black", condition_grade: "A", battery_health_pct: 90, price_pence: 12345, warranty_months: 12, description: null, status: "available", created_at: "2026-01-01T00:00:00Z", product_photos: [] }],
  redirects: [{ from_path: "/old-page", to_path: "/repairs" }],
};
export const received = { enquiries: [], events: [] };

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Content-Range": "0-0/*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");

  if (url.pathname === "/__received") return send(res, 200, received);
  if (url.pathname.startsWith("/auth/v1/")) return send(res, 401, { code: 401, msg: "no session" });
  if (url.pathname === "/rest/v1/rpc/check_rate_limit") return send(res, 200, true);
  const table = url.pathname.replace("/rest/v1/", "");

  if (req.method === "POST") {
    const row = { id: "66666666-6666-4666-8666-666666666666", status: "new", created_at: new Date().toISOString(), ...JSON.parse(raw || "{}") };
    (table === "enquiries" ? received.enquiries : received.events).push(row);
    return send(res, 201, single ? row : [row]);
  }
  let rows = tables[table];
  if (!rows) return send(res, 404, { message: `stub has no table ${table}` });
  for (const [key, value] of url.searchParams) {
    if (value.startsWith("eq.")) rows = rows.filter((r) => !(key in r) || String(r[key]) === value.slice(3));
  }
  const limit = Number(url.searchParams.get("limit")) || rows.length;
  rows = rows.slice(0, limit);
  if (single) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "0 or many rows", details: `The result contains ${rows.length} rows` });
  return send(res, 200, rows);
}).listen(54399, () => console.log("stub api on 54399"));
