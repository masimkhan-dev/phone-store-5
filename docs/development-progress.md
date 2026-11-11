# Development progress

Last updated: 11 November 2026.

## Verified in this build

| Check | Result |
|---|---|
| TypeScript strict type-check | passes |
| Unit tests | 27 pass |
| Database tests on local PostgreSQL 16 | 189 checks pass |
| Production build | passes |
| Browser smoke test against a fixture API | 57 checks pass |

The database tests cover: isolation on all 19 branch-owned tables for Staff, Manager, Owner, a deactivated user and a visitor; forged branch ids; invoice totals, discounts and status; immutability of every financial table; 20 simultaneous invoice saves with consecutive numbers; every figure in SRS section 11 against a manual calculation, per branch and consolidated; monthly expenses excluded from daily cash; closing variance; erasure keeping invoices.

## Not verified

- **Nothing has run against a real Supabase project.** No credentials were available and the build environment could not run a local Supabase stack. The SQL was tested on plain PostgreSQL with a small stand-in for Supabase's `auth` schema and roles; the pages were tested against a fixture API. Sign-in, two-factor, invitations, password reset, photo upload, storage policies and every `/admin` screen beyond "redirects to login when signed out" are therefore **type-checked but not exercised**. First task with credentials: run through each of them on staging.
- Enquiry alert emails (needs a Resend key).
- Lighthouse scores, Rich Results Test, the 60-second alert target, a scripted burst of 50 form posts against the real rate limiter.
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

## Phase B: Invoice — database done, screens not started

Schema, functions, policies and tests are complete. Not built: the one-screen completed-repair entry, invoice view, A4 and 80mm print layouts, server PDF, payments/refund/credit-note/cancel screens, customer pages, financial report screens, the Send review link button.

## Phase C: Control — database done, screens deliberately not started

Blocked on the client confirming how shops record sales today (SRS section 9). If a POS exists, this phase becomes an import.

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
