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

// ---- Signed-in fixtures for the dashboard smoke test ----
const USERS = {
  staff: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", full_name: "Fixture Staff", email: "staff@test.invalid", role: "staff", branch_id: B1, is_active: true },
  manager: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", full_name: "Fixture Manager", email: "manager@test.invalid", role: "manager", branch_id: B1, is_active: true },
  owner: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", full_name: "Fixture Owner", email: "owner@test.invalid", role: "owner", branch_id: null, is_active: true },
};
const INV = "77777777-7777-4777-8777-777777777777";
const CUST = "88888888-8888-4888-8888-888888888888";
const ENQ = "99999999-9999-4999-8999-999999999999";
const now = new Date().toISOString();
Object.assign(tables, {
  business_settings: [{ ...tables.business_settings[0], legal_name: null, vat_mode: "not_registered", vat_number: null, vat_rate_bp: 2000, vat_confirmed: false, prices_include_vat: true, invoice_terms: "Fixture invoice terms.", enquiry_retention_months: 12 }],
  profiles: Object.values(USERS),
  enquiries: [{ id: ENQ, branch_id: B1, type: "repair_quote", status: "new", customer_name: "Fixture Enquirer", customer_phone: "07000 111111", customer_email: null, device_type: "Phone", device_brand: null, device_model: "Fixture Model", fault: "Screen repair", product_id: null, storage: null, condition: null, message: null, source_url: "/example-town", landing_page: "/", utm_source: null, utm_medium: null, utm_campaign: null, assigned_to: null, outcome_note: null, sale_value_pence: null, first_contacted_at: null, status_changed_at: now, created_at: now }],
  enquiry_events: [{ id: 1, enquiry_id: ENQ, event_type: "created", from_status: null, to_status: "new", note: null, created_at: now, user_id: null }],
  customers: [{ id: CUST, branch_id: B1, name: "Fixture Customer", phone: "07000 222222", phone_normalised: "07000222222", email: null, erased_at: null, created_at: now, invoices: [] }],
  invoices: [{ id: INV, branch_id: B1, repair_id: "r", customer_id: CUST, invoice_number: "EX1-2026-00042", issued_at: now, issued_by_name: "Fixture Staff", customer_name: "Fixture Customer", customer_phone: "07000 222222", device_description: "Fixture Model", imei: null, warranty_days: 90, vat_mode: "not_registered", prices_include_vat: true, subtotal_pence: 8000, discount_kind: "percent", discount_percent_bp: 1000, discount_pence: 800, tax_pence: 0, total_pence: 7200, cancelled_at: null, cancel_reason: null }],
  invoice_lines: [{ id: "l1", invoice_id: INV, position: 1, description: "Fixture screen repair", quantity: 2, unit_price_pence: 2500, line_total_pence: 5000, tax_rate_bp: 0, tax_pence: 0 }, { id: "l2", invoice_id: INV, position: 2, description: "Fixture battery", quantity: 1, unit_price_pence: 3000, line_total_pence: 3000, tax_rate_bp: 0, tax_pence: 0 }],
  payments: [{ id: "pay1", invoice_id: INV, method: "cash", amount_pence: 4000, received_at: now }],
  refunds: [], credit_notes: [],
  invoice_balances: [{ invoice_id: INV, branch_id: B1, invoice_number: "EX1-2026-00042", issued_at: now, total_pence: 7200, credited_pence: 0, paid_pence: 4000, refunded_pence: 0, outstanding_pence: 3200, payment_status: "partially_paid" }],
  other_sales: [{ id: "os1", branch_id: B1, category: "accessory", description: "Fixture case", amount_pence: 1500, sold_at: now, voided_at: null, void_reason: null, payments: [{ method: "cash" }] }],
  expenses: [{ id: "ex1", branch_id: B1, expense_date: now.slice(0, 10), category: "shop_supplies", description: "Fixture supplies", amount_pence: 1200, method: "cash", frequency: "daily", receipt_path: null, voided_at: null, void_reason: null, created_at: now }],
  daily_closings: [], audit_logs: [{ id: 1, at: now, user_name: "Fixture Owner", branch_id: null, action: "login", entity: "profile", entity_id: null, details: {} }],
});
const rpc = {
  check_rate_limit: () => true, log_login: () => null, log_export: () => null, can_manage_user: () => true,
  report_acquisition: () => [{ branch_id: B1, sessions: 100, call_clicks: 5, whatsapp_clicks: 4, directions_clicks: 3, quote_starts: 6, quote_submits: 2, reserve_submits: 1, enquiries: 3, converted: 1, late_enquiries: 0, median_response_seconds: 600 }],
  report_top_pages: () => [{ page_path: "/example-town", sessions: 60, enquiry_actions: 7 }],
  report_financial: () => [{ branch_id: B1, invoice_count: 1, repair_revenue_pence: 7200, other_sales_pence: 1500, gross_sales_pence: 8700, refunds_pence: 0, net_sales_pence: 8700, payments_cash_pence: 5500, payments_card_pence: 0, payments_bank_transfer_pence: 0, payments_received_pence: 5500, outstanding_pence: 3200, expenses_pence: 1200, operating_movement_pence: 7500 }],
  cash_figures: () => [{ cash_received_pence: 5500, cash_expenses_pence: 1200, cash_refunds_pence: 0 }],
  issue_repair_invoice: () => ({ invoice_id: INV, invoice_number: "EX1-2026-00042", total_pence: 7200 }),
  record_payment: () => "pay2", record_other_sale: () => "os2", record_expense: () => "ex2", submit_daily_closing: () => "dc1",
};
function userFromToken(req) {
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  try { return USERS[JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).fixture_role] ?? null; } catch { return null; }
}

export const received = { enquiries: [], events: [], rpc: [] };
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
  if (url.pathname.startsWith("/auth/v1/")) {
    const user = userFromToken(req);
    return user ? send(res, 200, { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", factors: [] }) : send(res, 401, { code: 401, msg: "no session" });
  }
  if (url.pathname.startsWith("/storage/v1/")) return send(res, 200, []);
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").pop();
    received.rpc.push({ name, args: JSON.parse(raw || "{}"), role: userFromToken(req)?.role ?? null });
    return name in rpc ? send(res, 200, rpc[name]()) : send(res, 404, { message: `stub has no rpc ${name}` });
  }
  const table = url.pathname.replace("/rest/v1/", "");

  if (req.method === "POST") {
    const row = { id: "66666666-6666-4666-8666-666666666666", status: "new", created_at: new Date().toISOString(), ...JSON.parse(raw || "{}") };
    (table === "enquiries" ? received.enquiries : received.events).push(row);
    return send(res, 201, single ? row : [row]);
  }
  let rows = tables[table];
  if (!rows) return send(res, 404, { message: `stub has no table ${table}` });
  // The profile lookup: a signed-in fixture user only ever reads their own row here.
  if (table === "profiles" && url.searchParams.get("id")?.startsWith("eq.") && single) rows = rows.filter((r) => `eq.${r.id}` === url.searchParams.get("id"));
  if (req.method === "HEAD") { res.writeHead(200, { "Content-Range": `0-0/${rows.length}` }); return res.end(); }
  if (req.method === "PATCH" || req.method === "DELETE") return send(res, 200, single ? rows[0] : rows.slice(0, 1));
  for (const [key, value] of url.searchParams) {
    if (value.startsWith("eq.")) rows = rows.filter((r) => !(key in r) || String(r[key]) === value.slice(3));
  }
  const limit = Number(url.searchParams.get("limit")) || rows.length;
  rows = rows.slice(0, limit);
  if (single) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "0 or many rows", details: `The result contains ${rows.length} rows` });
  return send(res, 200, rows);
}).listen(54399, () => console.log("stub api on 54399"));
