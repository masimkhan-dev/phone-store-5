-- SRS section 11, checked against a manual calculation of the fixtures in 01_seed.sql.
-- Branch A, today:
--   invoices 72.00 + 100.00 + 50.00 + 40.00 (the cancelled 30.00 is excluded) = 262.00, less credit note 20.00 -> 242.00
--   other sales 15.00 + 10.00 (the voided 9.99 is excluded) -> 25.00
--   deductible refunds: 5.00 (the 20.00 paid out a credit note; the 30.00 is on a cancelled invoice)
--   payments cash 72+50+30+15 = 167.00, card 40+40+10 = 90.00, bank 10.00
--   outstanding: inv 2 50.00 + inv 5 5.00 = 55.00
--   expenses 12.00 + 800.00 + 3.00 (voided 7.00 excluded) = 815.00
--   cash day: received 167.00, daily cash expenses 12.00 (monthly rent excluded), cash refunds 50.00
--   closing: 100.00 + 167.00 - 12.00 - 50.00 = 205.00 expected, 204.00 counted -> variance -1.00
\set today '(now() at time zone ''Europe/London'')::date'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
create temp table r as select * from public.report_financial(:today, :today);
reset role;

\set A 'branch_id = ''aaaaaaaa-0000-0000-0000-000000000001'''
select test.eq('A invoice count', (select invoice_count from r where :A), 4);
select test.eq('A repair revenue', (select repair_revenue_pence from r where :A), 24200);
select test.eq('A other sales', (select other_sales_pence from r where :A), 2500);
select test.eq('A gross sales', (select gross_sales_pence from r where :A), 26700);
select test.eq('A refunds deducted once', (select refunds_pence from r where :A), 500);
select test.eq('A net sales', (select net_sales_pence from r where :A), 26200);
select test.eq('A payments cash', (select payments_cash_pence from r where :A), 16700);
select test.eq('A payments card', (select payments_card_pence from r where :A), 9000);
select test.eq('A payments bank transfer', (select payments_bank_transfer_pence from r where :A), 1000);
select test.eq('A payments received', (select payments_received_pence from r where :A), 26700);
select test.eq('A outstanding', (select outstanding_pence from r where :A), 5500);
select test.eq('A expenses include the monthly rent', (select expenses_pence from r where :A), 81500);
select test.eq('A operating movement', (select operating_movement_pence from r where :A), -55300);

-- Branch B: 60.00 + twenty concurrent 1.00 invoices, less 1.00 credit note; other sales 20.00.
\set B 'branch_id = ''bbbbbbbb-0000-0000-0000-000000000002'''
select test.eq('B repair revenue', (select repair_revenue_pence from r where :B), 6000 + 2000 - 100);
select test.eq('B gross sales', (select gross_sales_pence from r where :B), 9900);
select test.eq('B net sales', (select net_sales_pence from r where :B), 9900);
select test.eq('B payments received', (select payments_received_pence from r where :B), 6000 + 2000 + 2000);

-- Consolidated = sum of branches, for every figure.
select test.eq('consolidated net sales', (select sum(net_sales_pence) from r), 26200 + 9900);
select test.eq('consolidated payments', (select sum(payments_received_pence) from r), 26700 + 10000);

-- A repair payment is counted once: every payment has exactly one source.
select test.eq('no payment has two sources or none',
  (select count(*) from public.payments where (invoice_id is null) = (other_sale_id is null)), 0);
select test.eq('payments by method equal the payment rows',
  (select sum(payments_received_pence) from r),
  (select sum(p.amount_pence) from public.payments p left join public.other_sales s on s.id = p.other_sale_id where s.voided_at is null));

-- Daily cash and closing.
select test.eq('A cash received', (select cash_received_pence from public.cash_figures('aaaaaaaa-0000-0000-0000-000000000001', :today)), 16700);
select test.eq('A daily cash expenses exclude monthly rent', (select cash_expenses_pence from public.cash_figures('aaaaaaaa-0000-0000-0000-000000000001', :today)), 1200);
select test.eq('A cash refunds', (select cash_refunds_pence from public.cash_figures('aaaaaaaa-0000-0000-0000-000000000001', :today)), 5000);
select test.eq('A expected cash', (select expected_cash_pence from public.daily_closings where :A), 20500);
select test.eq('A variance', (select variance_pence from public.daily_closings where :A), -100);
select test.eq('closing created no payments or sales',
  (select count(*) from public.payments where received_at > (select max(submitted_at) from public.daily_closings where :A) and :A), 0);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select test.fails('a second closing for the same day is rejected', 'select public.submit_daily_closing(' || quote_literal((now() at time zone 'Europe/London')::date) || ', 0, 0)');
-- Reports are complete for a day with no closing: yesterday has none and still returns a row.
select test.eq('report works with no closing submitted',
  (select count(*) from public.report_financial((now() at time zone 'Europe/London')::date - 1, (now() at time zone 'Europe/London')::date - 1)), 1);
reset role;

-- Acquisition figures.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select test.eq('acquisition: sessions per branch', (select sessions from public.report_acquisition(:today, :today, 'aaaaaaaa-0000-0000-0000-000000000001')), 1);
select test.eq('acquisition: call clicks', (select call_clicks from public.report_acquisition(:today, :today, 'aaaaaaaa-0000-0000-0000-000000000001')), 1);
select test.eq('acquisition: converted enquiries', (select converted from public.report_acquisition(:today, :today, 'aaaaaaaa-0000-0000-0000-000000000001')), 1);

-- Erasure keeps invoices and removes the person.
select public.erase_person('07000 000002', null);
reset role;
select test.eq('erasure deleted the unconverted enquiry', (select count(*) from public.enquiries where id = 'eeeeeeee-0000-0000-0000-00000000000b'), 0);
select test.eq('erasure anonymised the customer', (select count(*) from public.customers where erased_at is not null and phone = ''), 1);
select test.eq('erasure kept the invoice', (select count(*) from public.invoices where invoice_number like 'TSB-%-00001'), 1);
