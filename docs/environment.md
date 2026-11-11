# Environment

Copy `.env.example` to `.env`. All variables are read on the server only.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_ANON_KEY` | yes | Visitor-level key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Full access. Server only. Never expose or commit it. |
| `SITE_URL` | yes | Public address, no trailing slash. An `https://` value turns on Secure cookies. |
| `HASH_SALT` | yes | Long random string for rate-limit and visit hashes |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Enquiry alert emails. Without them no alert email is sent (the server logs this); enquiries still reach the dashboard. |

Use a separate Supabase project and a separate set of variables for staging and production.

## Supabase project settings to make by hand

- **Auth > URL configuration:** set Site URL to `SITE_URL`; add `SITE_URL/reset-password` to the redirect allow list.
- **Auth > MFA:** enable TOTP (required for the Owner).
- **Auth > Email:** configure SMTP so invitations and password resets are delivered reliably.
- **Auth > Providers > Email:** disable public sign-ups. Users are created by invitation only.
- **Database > Backups:** confirm daily backups with 30-day retention on the chosen plan, and perform a test restore before launch.

## Still to be supplied by the client

Logo, branch details and hours, the service price list, shop photos, existing site URLs for the redirect map, Google Business Profile links and verified ratings, VAT mode (from the accountant), final privacy, cookie and terms wording.
