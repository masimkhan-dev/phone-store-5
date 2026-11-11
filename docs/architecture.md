# Architecture

## Stack, and one deviation from the SRS wording

| Layer | Choice | Note |
|---|---|---|
| Framework | **React Router 8 (framework mode)**, React 19, TypeScript strict | The SRS says "Remix". Remix v2 was merged into React Router; its maintainers' documented upgrade path is React Router framework mode. The package named `remix` today (v3) is a different, non-React framework. This is the closest supported implementation: same loaders, actions, server rendering and file conventions. |
| Styling | Tailwind CSS 4 | Tokens in `app/app.css` |
| Database, auth, storage | Supabase (PostgreSQL, Auth, Storage) | As specified |
| Validation | Zod 4 | One schema per form, used on the server |
| Financial writes | PostgreSQL functions | Atomic; see below |
| Email | Resend HTTP API | The SRS says "transactional email service" without naming one. Isolated in `modules/enquiries/notify.server.ts`; swap freely. |
| Hosting | Any Node 22 host | Runs with `react-router-serve`. Vercel/Netlify adapters are not installed yet: see deployment.md |

## Shape

A modular monolith. `app/modules/*` hold business operations (enquiries, catalogue, reporting, site data); `app/lib/*` hold shared pure logic (money, hours, dates, SEO) and the server clients; `app/routes/*` are thin: load, call a module, render.

Three database clients, by privilege (`app/lib/supabase.server.ts`):

- `publicClient`: anon key. Visitors. Limited by RLS and column grants (no IMEI, no VAT settings).
- `userClient`: the signed-in user's session from HTTP-only cookies. Everything in `/admin` uses it, so RLS decides what each role and branch sees.
- `serviceClient`: service role, server only. Used for: saving a visitor's enquiry, tracking events, the rate limiter, and inviting auth users.

## Branch isolation (two layers)

1. **Database.** Every branch-owned table has `branch_id` and policies built on `app.can_access_branch()` / `app.can_manage_branch()`, which read the caller's role and branch from `profiles`. A deactivated profile resolves to no role, so it sees nothing.
2. **Server.** `requireUser` loads the profile on every request; `requireRole` gates Manager/Owner pages; a non-Owner's branch is always taken from the profile.

The Owner must pass two-factor authentication (`aal2`) on every session. Sessions end after 8 hours idle.

## Money

Integer pence everywhere. `issue_repair_invoice` does, in one transaction: customer match-or-create, repair row, gapless number, invoice, lines (with tax rate and tax stored per line), first payment, enquiry conversion, audit. The number comes from a row in `invoice_counters` locked by `UPDATE ... RETURNING`; concurrent saves queue and a failed save rolls its number back. Triggers make invoices, lines, payments, refunds, credit notes, closings and the audit log append-only for every role.

### Decisions that need the client's accountant

These are implemented as described and flagged in development-progress.md:

- **Refunds and net sales.** A refund that pays out a credit note (`refunds.credit_note_id`), or sits on a cancelled invoice, is *not* deducted from net sales again, because the credit note or cancellation already removed that revenue. Only a refund with neither is deducted.
- **Cancelling** requires the money received to be refunded first.
- **Voiding.** Other sales and expenses can be voided with a reason (not in the SRS, which only names adjustments for closings).
- **VAT.** `vat_mode`, rate and "prices include VAT" are settings; tax is stored per line at issue. Margin-scheme invoices show no VAT.

## Public website

Server-rendered. Branch pages (`/:branch`) and local service pages (`/:branch/:service`) come from one template each, driven by database rows: adding a branch or a service needs no code. The site layout resolves "branch context" from the URL, so header, footer, sticky mobile bar and every call/WhatsApp link use that branch's details.

Tracking is first-party (`/api/track`): no cookies, no storage, no personal data. Visits are counted with a salted hash that changes daily. Google Analytics loads only after the visitor accepts.

Unknown paths consult the `redirects` table and answer 301, otherwise 404.

## Not built, by design

Repair pipelines, stock control, POS, online payment, SMS/WhatsApp API automation, a configurable permissions engine. See SRS section 18.
