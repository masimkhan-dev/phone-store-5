// Dashboard smoke test: opens every staff screen as fixture Staff, Manager and Owner users
// against tests/e2e/stub-api.mjs. It proves the screens render and the forms send the right
// data. It does NOT prove access control: the stub has no Row Level Security. That is
// covered by tests/db against real PostgreSQL.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STUB = "http://localhost:54399";
const OUT = process.env.SHOT_DIR ?? "tests/e2e/screenshots";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (label, pass, detail = "") => { console.log(`${pass ? "ok  " : "FAIL"} ${label}${pass ? "" : ` ${detail}`}`); if (!pass) failures++; };

// A session cookie in the format the Supabase SSR client reads. The stub accepts the unsigned token.
function sessionCookie(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: role, exp, fixture_role: role, aal: "aal2", amr: [{ method: "totp", timestamp: exp - 3600 }], role: "authenticated" })}.${Buffer.from("fixture-signature-not-verified").toString("base64url")}`;
  const session = { access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: role } };
  return { name: "sb-localhost-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, domain: "localhost", path: "/" };
}

const browser = await chromium.launch();
async function as(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([sessionCookie(role)]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const INV = "77777777-7777-4777-8777-777777777777";

// ---- Manager: every screen renders ----
{
  const { context, page, errors } = await as("manager");
  const pages = ["/admin", "/admin/enquiries", "/admin/enquiries/99999999-9999-4999-8999-999999999999", "/admin/repairs/new", "/admin/invoices", `/admin/invoices/${INV}`, "/admin/customers", "/admin/customers/88888888-8888-4888-8888-888888888888", "/admin/sales", "/admin/catalogue", "/admin/catalogue/new", "/admin/expenses", "/admin/closing", "/admin/finance", "/admin/reports", "/admin/branch", "/admin/users"];
  for (const path of pages) {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
    check(`manager: ${path} renders`, res.status() === 200 && (await page.locator("h1").count()) > 0, `status ${res.status()}`);
  }
  for (const path of ["/admin/content", "/admin/audit", "/admin/settings"]) {
    check(`manager: ${path} is refused (Owner only)`, (await page.goto(BASE + path)).status() === 403);
  }
  check("manager sees the signed-in name and role", await page.goto(BASE + "/admin").then(() => page.getByText("Fixture Manager").isVisible()));
  check("new enquiry badge shows in the menu", await page.getByLabel("1 new").isVisible());
  check("no page errors as manager", errors.length === 0, errors.join(" | "));

  // Repair entry: one screen, live total, one button to save and print.
  await page.goto(BASE + "/admin/repairs/new", { waitUntil: "networkidle" });
  await page.getByLabel("Customer phone").fill("07000 222222");
  await page.getByLabel("Customer phone").blur();
  await page.waitForFunction(() => document.querySelector('input[name="customer_name"]')?.value === "Fixture Customer", null, { timeout: 5000 }).catch(() => {});
  check("returning customer's name fills in from the phone number", (await page.getByLabel("Customer name").inputValue()) === "Fixture Customer");
  await page.getByLabel("Device model").fill("Fixture Model");
  await page.getByLabel("Description", { exact: true }).fill("Screen");
  await page.getByLabel("Qty").fill("2");
  await page.getByLabel("Price £").fill("25");
  await page.getByRole("button", { name: "Add another charge" }).click();
  await page.getByLabel("Description 2").fill("Battery");
  await page.getByLabel("Price £").nth(1).fill("30.00");
  await page.getByLabel("Discount", { exact: true }).selectOption("percent");
  await page.getByLabel("Discount %").fill("10");
  check("live total shows 72.00", (await page.locator('[aria-live="polite"]').textContent()) === "£72.00");
  await page.screenshot({ path: `${OUT}/repair-entry.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and print invoice" }).click();
  await page.waitForURL(/\/admin\/invoices\/.+\/print/, { timeout: 10000 });
  const received = await (await fetch(`${STUB}/__received`)).json();
  const call = received.rpc.filter((r) => r.name === "issue_repair_invoice").at(-1)?.args?.p;
  check("repair entry sent integer pence lines", JSON.stringify(call?.lines) === JSON.stringify([{ description: "Screen", quantity: 2, unit_price_pence: 2500 }, { description: "Battery", quantity: 1, unit_price_pence: 3000 }]), JSON.stringify(call?.lines));
  check("repair entry sent a 10% discount as 1000 basis points", call?.discount_kind === "percent" && call?.discount_value === 1000);
  check("repair entry asked the database to pay in full", call?.paid_in_full === true && call?.payment_method === "cash");
  check("a manager's request names no branch (the database uses the profile)", call?.branch_id === null);

  // Print view
  check("save lands on the print view", await page.getByText("EX1-2026-00042").first().isVisible());
  check("print view has no dashboard menu", (await page.getByRole("navigation", { name: "Dashboard" }).count()) === 0);
  check("print view shows total, payment status and warranty", (await page.getByText("£72.00").count()) > 0 && (await page.getByText(/Status: Partially paid/).count()) > 0 && (await page.getByText("3 months warranty").count()) > 0);
  check("parts cost is never on the invoice", !(await page.content()).toLowerCase().includes("parts cost"));
  await page.emulateMedia({ media: "print" });
  check("print hides the buttons", !(await page.getByRole("button", { name: "Print", exact: true }).isVisible()));
  await page.pdf({ path: `${OUT}/invoice-a4-browser.pdf`, preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({ path: `${OUT}/invoice-print-a4.png`, fullPage: true });
  await page.goto(BASE + `/admin/invoices/${INV}/print?layout=thermal_80mm`, { waitUntil: "networkidle" });
  const width = await page.locator("article").evaluate((el) => el.getBoundingClientRect().width);
  check("80mm layout is 80mm wide", Math.abs(width - 302.4) < 2, `width ${width}`);
  await page.screenshot({ path: `${OUT}/invoice-print-80mm.png`, fullPage: true });

  // Invoice detail and downloads
  await page.goto(BASE + `/admin/invoices/${INV}`, { waitUntil: "networkidle" });
  check("invoice shows the outstanding balance", (await page.getByText("£32.00").count()) > 0);
  check("manager sees refund and cancel", (await page.getByRole("button", { name: "Record refund" }).count()) === 1 && (await page.getByRole("button", { name: "Cancel invoice" }).count()) === 1);
  check("cancel is blocked while money is held", await page.getByRole("button", { name: "Cancel invoice" }).isDisabled());
  await page.screenshot({ path: `${OUT}/invoice-detail.png`, fullPage: true });
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  for (const [path, type, magic] of [[`/admin/invoices/${INV}/pdf`, "application/pdf", "%PDF-"], [`/admin/invoices/${INV}/pdf?layout=thermal_80mm`, "application/pdf", "%PDF-"], ["/admin/finance/summary", "application/pdf", "%PDF-"]]) {
    const res = await fetch(BASE + path, { headers: { cookie } });
    check(`${path} returns a PDF`, res.status === 200 && res.headers.get("content-type") === type && Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString() === magic);
  }
  const csv = await fetch(BASE + "/admin/finance/export?preset=today", { headers: { cookie } });
  const csvText = await csv.text();
  check("financial CSV downloads", csv.status === 200 && csv.headers.get("content-type").startsWith("text/csv"));
  check("CSV figures equal the screen's source figures", csvText.includes("Example Town,1,72.00,15.00,87.00,0.00,87.00,55.00"), csvText.split("\r\n")[2]);
  await page.goto(BASE + "/admin/finance?preset=today", { waitUntil: "networkidle" });
  check("financial screen shows the same repair revenue and net sales", (await page.getByRole("cell", { name: "£72.00" }).count()) > 0 && (await page.getByRole("cell", { name: "£87.00" }).count()) > 0);
  const after = await (await fetch(`${STUB}/__received`)).json();
  check("exports were written to the audit log", after.rpc.filter((r) => r.name === "log_export").length >= 2);
  await page.screenshot({ path: `${OUT}/finance.png`, fullPage: true });

  // Other sale and closing forms post the right values
  await page.goto(BASE + "/admin/sales", { waitUntil: "networkidle" });
  await page.getByLabel("Description").fill("Fixture charger");
  await page.getByLabel("Amount £").fill("14.99");
  await page.getByRole("button", { name: "Record sale" }).click();
  await page.getByText("Sale of £14.99 recorded.").waitFor({ timeout: 10000 });
  const sale = (await (await fetch(`${STUB}/__received`)).json()).rpc.filter((r) => r.name === "record_other_sale").at(-1)?.args;
  check("other sale sent 1499 pence and no branch", sale?.p_amount_pence === 1499 && sale?.p_branch === null);
  await page.goto(BASE + "/admin/closing", { waitUntil: "networkidle" });
  check("closing shows cash received from recorded transactions", (await page.getByText("£55.00").count()) > 0);
  await page.getByLabel("Opening cash £").fill("100");
  await page.getByLabel("Counted closing cash £").fill("143.00");
  await page.getByRole("button", { name: "Submit closing" }).click();
  await page.getByText(/Closing submitted/).waitFor({ timeout: 10000 });
  const closing = (await (await fetch(`${STUB}/__received`)).json()).rpc.filter((r) => r.name === "submit_daily_closing").at(-1)?.args;
  check("closing sent only opening and counted cash", closing?.p_opening_pence === 10000 && closing?.p_counted_pence === 14300 && Object.keys(closing).length === 4);
  check("no page errors in manager flows", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---- Staff: operational screens only ----
{
  const { context, page, errors } = await as("staff");
  for (const path of ["/admin", "/admin/enquiries", "/admin/repairs/new", "/admin/invoices", `/admin/invoices/${INV}`, "/admin/customers", "/admin/sales", "/admin/catalogue"]) {
    check(`staff: ${path} renders`, (await page.goto(BASE + path, { waitUntil: "networkidle" })).status() === 200);
  }
  for (const path of ["/admin/expenses", "/admin/closing", "/admin/finance", "/admin/reports", "/admin/branch", "/admin/users", "/admin/content", "/admin/audit", "/admin/settings", "/admin/finance/export"]) {
    check(`staff: ${path} is refused`, (await page.goto(BASE + path)).status() === 403);
  }
  await page.goto(BASE + `/admin/invoices/${INV}`, { waitUntil: "networkidle" });
  check("staff can record a payment but sees no refund or cancel", (await page.getByRole("button", { name: "Record payment" }).count()) === 1 && (await page.getByRole("button", { name: "Record refund" }).count()) === 0 && (await page.getByRole("button", { name: "Cancel invoice" }).count()) === 0);
  await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  check("staff menu hides manager and owner screens", (await page.getByRole("link", { name: "Financial report" }).count()) === 0 && (await page.getByRole("link", { name: "Expenses" }).count()) === 0);
  check("staff dashboard shows no takings", (await page.getByText("Cash taken today").count()) === 0);
  check("no page errors as staff", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---- Owner: everything, across branches ----
{
  const { context, page, errors } = await as("owner");
  for (const path of ["/admin", "/admin/enquiries", "/admin/repairs/new", "/admin/invoices", "/admin/sales", "/admin/expenses", "/admin/closing", "/admin/finance", "/admin/reports", "/admin/branch", "/admin/users", "/admin/content", "/admin/audit", "/admin/settings"]) {
    check(`owner: ${path} renders`, (await page.goto(BASE + path, { waitUntil: "networkidle" })).status() === 200);
  }
  await page.goto(BASE + "/admin/repairs/new", { waitUntil: "networkidle" });
  check("owner must choose a branch for a repair", (await page.getByLabel("Branch").count()) === 1);
  check("owner header says All branches", await page.goto(BASE + "/admin").then(() => page.getByText("All branches").first().isVisible()));
  check("no page errors as owner", errors.length === 0, errors.join(" | "));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE + "/admin/repairs/new", { waitUntil: "networkidle" });
  check("repair entry has no horizontal scroll on a phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${OUT}/repair-entry-mobile.png` });
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "ADMIN SMOKE TEST PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
