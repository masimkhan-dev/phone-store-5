# Development progress

Last updated: 11 November 2026. All three phases are built; none has run against a real Supabase project yet.

## Verified in this build

| Check | Result |
|---|---|
| TypeScript strict type-check | passes |
| Unit tests | 36 pass |
| Database tests on local PostgreSQL 16 | 197 checks pass |
| Production build | passes |
| Public site browser smoke test (fixture API) | 57 checks pass |
| Dashboard browser smoke test (fixture API, signed in as Staff, Manager, Owner) | 89 checks pass |

The database tests cover: isolation on all 19 branch-owned tables for Staff, Manager, Owner, a deactivated user and a visitor; forged branch ids; invoice totals, discounts, VAT and status; immutability of every financial table; 20 simultaneous invoice saves with consecutive numbers; every figure in SRS section 11 against a manual calculation, per branch and consolidated; monthly expenses excluded from daily cash; closing variance; atomic credit-and-refund; erasure keeping invoices.

The dashboard smoke test opens every screen for each role, enters a completed repair and checks what is sent to the database, checks the print view in both layouts, downloads both invoice PDFs, the financial CSV and the monthly PDF, records an other sale and submits a closing.

## Not verified

- **Nothing has run against a real Supabase project.** No credentials were available and the build environment could not run a local Supabase stack. The SQL was tested on plain PostgreSQL with a small stand-in for Supabase's `auth` schema and roles. The screens were tested against a fixture API that has **no Row Level Security and accepts an unsigned sign-in token**, so those tests prove rendering and form behaviour, not security. First task with credentials: run every flow on staging, especially real sign-in, two-factor enrolment, invitations, password reset, photo and receipt upload, and storage policies.
- Printing on a real A4 printer and a real 80mm thermal printer. The layouts were checked on screen and as PDF only.
- Enquiry alert emails (needs a Resend key).
- Lighthouse scores, Rich Results Test, the 60-second alert target, a scripted burst of 50 form posts against the real rate limiter, the "under 60 seconds" entry time with a trained member of staff.
- Vercel/Netlify adapters.

## Phase A: Acquire — built

Public site: home, branch pages, local service pages, price guide, shop, product, sell your phone, unlocking, reviews, FAQ, about, contact, privacy, cookies, terms, sitemap, robots, 301 redirect map. Four-step quote tool, reserve and collect, sell-your-phone and general forms, each saved through one validated server operation with honeypot and rate limiting. First-party tracking. Cookie consent gating Google Analytics. Structured data. Sticky mobile action bar. 3D animated phone on branch pages.

Dashboard: sign in, sign out, password reset, Owner two-factor, Today, enquiry inbox (tabs, search, late and follow-up flags, 30-second polling with badge and sound), enquiry detail (status, outcome, sale value, assignment, notes, history, Owner move), catalogue with photo upload, branch details, hours and closures, users, prices and content, enquiry report with CSV export and top pages, audit log, settings, personal-data find, export and erase.

### Known gaps in Phase A

- Site search in the header (the brief says "where useful"; not built).
- Legal pages are drafts with a visible notice.
- No error tracking or uptime monitoring integrated.
- Fonts load from Google Fonts; self-host them before the Lighthouse pass.
- Product photos are stored as uploaded; serve them through Supabase image transformation (WebP/AVIF, sized) before launch.
- "Late" in owner reports uses 30 wall-clock minutes; the live inbox uses 30 minutes of opening hours.
- The Owner's two-factor cannot be reset from the dashboard.

## Phase B: Invoice — built

One-screen completed-repair entry (returning-customer lookup by phone, charge lines, discount, warranty, internal parts cost, linked enquiry, payment, live total) that saves, invoices, pays and opens the print view in one action. Invoice list and detail, A4 and 80mm print views, server-generated PDF in both layouts, later payments, refund, refund with credit note (atomic), credit note, cancellation, WhatsApp share and review-link buttons, customer list and history, financial report with CSV and monthly PDF, Today dashboard figures.

### Known gaps in Phase B

- No margin report yet (internal parts cost is stored but not reported).
- Margin-scheme invoices show no VAT line and rely on the Owner's "Invoice terms" text for the required wording. The accountant must supply it.
- The logo is not embedded in the PDF (it is in the browser print view).
- A credit note has no printable document of its own.

## Phase C: Control — built

Other sales entry (with optional catalogue item, which marks it Sold) and void; expenses with receipt upload, Daily/Monthly type and void; optional daily closing (two numbers, opening defaults to the previous count, final at once, adjustments with a reason); financial report including other sales and expenses by category, operating movement, cash variance and closings submitted.

**Built at the project owner's instruction before the POS question was answered.** SRS section 9 says this phase starts only after the client confirms how shops record sales today. If a POS already holds that data, the manual other-sales entry should be replaced by an import through the same `record_other_sale` function, to avoid duplicate entry.

## Open questions for the client

1. Five branches or six?
2. What do shops use today for receipts and daily sales?
3. VAT registered? Which scheme for used phones? Are till prices VAT-inclusive? (accountant)
4. A4 or 80mm printers, per branch?
5. Existing website URLs for the redirect map.
6. **Refund treatment** (see architecture.md): is "a refund against a credit note is not deducted twice" the intended reading? Should a refund always require a credit note or a cancellation? (accountant)
7. May other sales and expenses be voided with a reason?
8. Enquiry retention of 12 months, and the invoice retention period.
9. Which email provider, and the sending address.
10. Vercel, Netlify or a Node container host.
