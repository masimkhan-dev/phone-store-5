#!/usr/bin/env bash
# 20 simultaneous saves in one branch must produce 20 consecutive numbers: no gaps, no duplicates.
set -euo pipefail
DB="$1"
before=$(psql -qtA -d "$DB" -c "select last_number from invoice_counters where branch_id = 'bbbbbbbb-0000-0000-0000-000000000002'")
for i in $(seq 1 20); do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<SQL &
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
select public.issue_repair_invoice('{"customer_name":"Concurrent $i","customer_phone":"0711100$(printf %04d "$i")","device_model":"x",
  "lines":[{"description":"x","quantity":1,"unit_price_pence":100}],"payment_method":"card","payment_amount_pence":100}');
SQL
done
wait
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
select test.eq('20 concurrent saves produced 20 invoices',
  (select count(*) from public.invoices where customer_name like 'Concurrent %'), 20);
select test.eq('numbers are consecutive with no gaps or duplicates',
  (select count(distinct right(invoice_number, 5)::int) from public.invoices
    where branch_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      and right(invoice_number, 5)::int between $before + 1 and $before + 20), 20);
select test.eq('counter equals the highest number issued',
  (select last_number from public.invoice_counters where branch_id = 'bbbbbbbb-0000-0000-0000-000000000002'), $before + 20);
SQL
