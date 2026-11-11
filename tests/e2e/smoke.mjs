// Browser smoke test of the built site against tests/e2e/stub-api.mjs.
// Run: node tests/e2e/stub-api.mjs & SUPABASE_URL=http://localhost:54399 ... npm start & node tests/e2e/smoke.mjs
import { createRequire } from "node:module";
// require() also finds a globally installed Playwright, which ESM import does not.
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "tests/e2e/screenshots";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (label, pass, detail = "") => { console.log(`${pass ? "ok  " : "FAIL"} ${label}${pass ? "" : ` ${detail}`}`); if (!pass) failures++; };

const browser = await chromium.launch();
// A normal user agent: the tracker deliberately ignores bots and headless browsers.
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: UA });
const page = await desktop.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });

// Home
let res = await page.goto(BASE + "/", { waitUntil: "networkidle" });
check("home returns 200", res.status() === 200);
check("home shows the business name from the database", await page.getByText("Example Phones (test fixture)").first().isVisible());
check("home title is set", (await page.title()).includes("Example Phones"));
check("home has a canonical link", (await page.locator('link[rel="canonical"]').getAttribute("href"))?.endsWith("/"));
check("promo banner shows", await page.getByText("Fixture promo banner").isVisible());
check("both branches are listed from data", (await page.locator("#branches article").count()) === 2);
check("no unverified Google rating is shown", (await page.getByText("on Google").count()) === 0);
await page.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true });

// Quote tool: four steps, price before contact details, branch required on the brand page
await page.getByRole("button", { name: "Phone", exact: true }).click();
await page.getByLabel(/Which model/).fill("Fixture Model");
await page.getByRole("button", { name: "Next: the fault" }).click();
await page.getByRole("button", { name: "Screen repair" }).click();
check("starting price shows before contact details", await page.locator("#quote").getByText("£12.34").isVisible());
check("turnaround shows before contact details", await page.locator("#quote").getByText("Usually ready in fixture time").isVisible());
await page.getByLabel("Your name").fill("Smoke Test");
await page.getByLabel("Phone number").fill("07000 000000");
await page.getByRole("button", { name: "Send my quote request" }).click();
check("brand page will not submit without a branch", !(await page.getByText("Quote request sent").isVisible().catch(() => false)));
await page.getByLabel("Nearest branch").selectOption({ label: "Sample City" });
await page.getByRole("button", { name: "Send my quote request" }).click();
await page.getByText("Quote request sent").waitFor({ timeout: 10000 });
const received = await (await fetch("http://localhost:54399/__received")).json();
const enquiry = received.enquiries.at(-1);
check("quote reached the server with the chosen branch", enquiry?.branch_id === "22222222-2222-4222-8222-222222222222");
check("quote carries device, model and fault", enquiry?.device_type === "Phone" && enquiry?.device_model === "Fixture Model" && enquiry?.fault === "Screen repair");
check("quote carries the source page", enquiry?.source_url === "/");
check("honeypot field was not sent to the database", !("company" in (enquiry ?? {})));
check("quote_start and quote_submit were tracked", received.events.some((e) => e.event_type === "quote_start") && received.events.some((e) => e.event_type === "quote_submit"));
check("page_view was tracked without personal data", received.events.some((e) => e.event_type === "page_view" && !("customer_name" in e)));

// Branch page
res = await page.goto(BASE + "/example-town", { waitUntil: "networkidle" });
check("branch page returns 200", res.status() === 200);
check("branch H1 names the town", await page.getByRole("heading", { level: 1, name: "Phone repairs in Example Town" }).isVisible());
check("branch title is unique to the branch", (await page.title()).startsWith("Phone repairs in Example Town"));
check("header shows this branch's phone", await page.locator("header").getByText("01000 000001").isVisible());
check("footer shows this branch's address", await page.locator("footer").getByText("1 Example Street").isVisible());
check("call link dials this branch", (await page.locator('main a[href^="tel:"]').first().getAttribute("href")) === "tel:01000000001");
check("WhatsApp link uses this branch with a pre-filled message", (await page.locator('main a[href^="https://wa.me/447000000001?text="]').count()) > 0);
check("opening hours table is present", await page.getByRole("table", { name: /Opening hours/ }).isVisible());
const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
check("branch structured data is a MobilePhoneStore", ld["@type"] === "MobilePhoneStore" && ld.address.postalCode === "EX1 1AA");
check("3D phone is rendered", await page.getByRole("img", { name: /cracked screen being repaired/ }).isVisible());
await page.screenshot({ path: `${OUT}/branch-desktop.png`, fullPage: true });
await page.locator('main a[href^="tel:"]').first().evaluate((a) => { a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
await page.waitForTimeout(300);
const afterCall = await (await fetch("http://localhost:54399/__received")).json();
check("call click was recorded for this branch", afterCall.events.some((e) => e.event_type === "call_click" && e.branch_id === "11111111-1111-4111-8111-111111111111"));

// Service page
res = await page.goto(BASE + "/example-town/screen-repair", { waitUntil: "networkidle" });
check("service page returns 200", res.status() === 200);
check("service title has town, service and starting price", (await page.title()).startsWith("Screen repair in Example Town from £12.34"));
check("service description mentions the town", (await page.locator('meta[name="description"]').getAttribute("content")).includes("Example Town"));
check("quote tool is preset to this branch (no branch picker)", (await page.getByLabel("Nearest branch").count()) === 0);

// Other pages
for (const path of ["/repairs", "/shop", "/shop/fixture-phone", "/sell-your-phone", "/unlocking", "/reviews", "/faq", "/about", "/contact", "/privacy", "/cookies", "/terms"]) {
  res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  check(`${path} returns 200`, res.status() === 200);
}
check("IMEI appears nowhere on the product page", !(await page.goto(BASE + "/shop/fixture-phone").then(() => page.content())).toLowerCase().includes("imei"));

// Routing
const before = errors.length;
res = await page.goto(BASE + "/no-such-branch");
check("unknown path is a 404", res.status() === 404);
errors.length = before; // the browser logs the deliberate 404 as a console error
const redirect = await fetch(BASE + "/old-page", { redirect: "manual" });
check("redirect map returns a 301 to the new page", redirect.status === 301 && redirect.headers.get("location") === "/repairs");
const admin = await fetch(BASE + "/admin", { redirect: "manual" });
check("dashboard requires sign-in", admin.status === 302 && admin.headers.get("location")?.startsWith("/login"));
const adminData = await fetch(BASE + "/admin/enquiries", { redirect: "manual" });
check("enquiry inbox requires sign-in", adminData.status === 302);
const sitemap = await (await fetch(BASE + "/sitemap.xml")).text();
check("sitemap lists branch and service pages", sitemap.includes("/example-town/screen-repair") && sitemap.includes("/sample-city"));
check("robots.txt blocks the dashboard", (await (await fetch(BASE + "/robots.txt")).text()).includes("Disallow: /admin"));
check("tracking rejects malformed events", (await fetch(BASE + "/api/track", { method: "POST", body: '{"event":"quote_submit","path":"/"}' })).status === 400);
check("no cookies are set for a visitor", (await desktop.cookies()).length === 0);
check("no browser errors", errors.length === 0, errors.join(" | "));

// Phone
const phone = await browser.newContext({ ...devices["Pixel 7"] });
const m = await phone.newPage();
await m.setViewportSize({ width: 360, height: 740 });
await m.goto(BASE + "/example-town", { waitUntil: "networkidle" });
const bar = m.locator("div.fixed.bottom-0");
check("sticky bar shows Call, WhatsApp and Quote on a phone", (await bar.getByRole("link").count()) === 3 && (await bar.isVisible()));
check("no horizontal scroll at 360px", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await m.screenshot({ path: `${OUT}/branch-mobile.png` });
await m.goto(BASE + "/", { waitUntil: "networkidle" });
check("home has no horizontal scroll at 360px", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await m.screenshot({ path: `${OUT}/home-mobile.png` });

await browser.close();
console.log(failures === 0 ? "SMOKE TEST PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
