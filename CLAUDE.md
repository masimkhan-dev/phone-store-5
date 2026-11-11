# Working on this repository

Source of truth for requirements: SRS v2 (summarised in docs/architecture.md). Read docs/development-progress.md before starting work.

## Rules that must not be broken

- **No repair pipeline.** No stages, statuses, technicians or progress tracking for repairs. A repair is recorded once, after it is finished, together with its invoice.
- **Money is integer pence.** Never do floating-point arithmetic on amounts. Parse with `parsePounds`, format with `formatPence`.
- **Branch comes from the profile.** Never trust a branch id from the browser for a non-Owner. Every branch-owned table has `branch_id` and an RLS policy; `tests/db/02_isolation.test.sql` checks every such table automatically and fails if a new one has no policy.
- **Financial rows are append-only.** Writes go through the SQL functions in `supabase/migrations`. Never add update or delete grants on financial tables.
- **One calculation, many screens.** Figures come from `report_financial`, `report_acquisition` and `cash_figures`. Do not recompute them in a route or component.
- **Nothing invented.** No branch names, prices, ratings, reviews or policies in code. Content comes from the database; a missing value renders nothing or a neutral fallback.
- **Migrations are additive.** Add a new timestamped file; never edit one that has been applied to a real database, and never write a destructive migration without approval.
- The service-role client (`serviceClient`) is for the few visitor-triggered writes and auth admin calls only. Anything a signed-in user does uses `userClient` so RLS applies.

## Commands

`npm run check` (typecheck, unit tests, build), `npm run test:db`, `npm run test:e2e`.

## Conventions

- Routes are declared in `app/routes.ts`. Server-only files end in `.server.ts`.
- Public pages read through `app/modules/site/data.server.ts`. All four enquiry forms post to their own route, which calls `submitEnquiry`.
- UI copy: plain British English, sentence case, buttons say what they do.
