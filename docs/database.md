# Database

Migrations live in `supabase/migrations`, applied in filename order. Never edit an applied migration; add a new one.

| Migration | Contents |
|---|---|
| `…0100_foundation` | `branches`, `branch_hours`, `branch_closures`, `profiles`, `business_settings`, `audit_logs`; identity helpers in schema `app`; user-management functions |
| `…0200_website_enquiries_catalogue` | `services`, `service_prices`, `faqs`, `banners`, `redirects`, `products`, `product_photos`, `enquiries`, `enquiry_events`, `site_events`, `form_rate_limits` |
| `…0300_invoicing` | `customers`, `repairs`, `invoice_counters`, `invoices`, `invoice_lines`, `payments`, `credit_notes`, `refunds`, view `invoice_balances`; invoice functions |
| `…0400_control` | `other_sales`, `expenses`, `daily_closings`, `adjustments`; `cash_figures` and the Phase C write functions |
| `…0500_reporting` | `report_financial`, `report_acquisition`, `erase_person`, `purge_expired_enquiries` |
| `…0700_credit_and_refund` | `credit_and_refund`: credit note plus its refund in one transaction |
| `…0600_storage_and_top_pages` | `report_top_pages`; storage buckets and their policies (skipped where there is no `storage` schema) |

One table beyond the SRS list: `form_rate_limits`, needed for public-form and login rate limiting on serverless hosting.

## Who can do what

| Table group | Visitor | Staff | Manager | Owner |
|---|---|---|---|---|
| Branch details, hours, closures | read | read | edit own (not slug/code/rating) | all |
| Services, prices, FAQs, banners, redirects | read published | read | read | edit |
| Products, photos | read Available, no IMEI | own branch | own branch | all |
| Enquiries, events | none (server inserts) | own branch | own branch | all, can move |
| Site events | none | read own branch | read own branch | read all |
| Customers, repairs, invoices, lines, payments | none | read own; write via functions | same | all |
| Credit notes, refunds, cancellation | none | read | create via functions | all |
| Other sales | none | read; record via function | plus void | all |
| Expenses, closings, adjustments | none | none | own branch via functions | all |
| Audit log | none | none | none | read |

## Functions the application calls

`issue_repair_invoice(jsonb)`, `record_payment`, `cancel_invoice`, `create_credit_note`, `record_refund`, `credit_and_refund`, `record_other_sale`, `void_other_sale`, `record_expense`, `void_expense`, `submit_daily_closing`, `record_adjustment`, `cash_figures`, `report_financial`, `report_acquisition`, `report_top_pages`, `create_profile`, `update_profile`, `can_manage_user`, `log_login`, `log_export`, `erase_person`, `check_rate_limit` (service role only), `purge_expired_enquiries` (service role only; schedule it daily).

## Testing

`npm run test:db` needs a local PostgreSQL 15+ and a superuser login. It creates database `mbmp_test`, loads `tests/db/00_supabase_shim.sql` (stand-ins for the `auth` schema and Supabase roles), applies every migration and runs the tests. The fixtures are deliberately fake ("Test Branch A").
