-- Test fixtures only. Two obviously fake branches with known figures; see 05_financial.test.sql.
create schema test;
grant usage on schema test to anon, authenticated, service_role;
create function test.eq(p_label text, p_actual numeric, p_expected numeric) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok   %', p_label;
end $$;
create function test.count_branch(p_table text, p_branch uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where branch_id = %L', p_table, p_branch) into n;
  return n;
end $$;
create function test.fails(p_label text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   % (rejected: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement was allowed', p_label;
end $$;
grant execute on all functions in schema test to anon, authenticated, service_role;

insert into public.branches (id, slug, code, name, town, address_line1, postcode, phone, default_warranty_days) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'test-a', 'TSA', 'Test Branch A', 'Test A', '1 Test Street', 'T1 1AA', '01000 000001', 90),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'test-b', 'TSB', 'Test Branch B', 'Test B', '2 Test Street', 'T2 2BB', '01000 000002', 30);

insert into auth.users (id, email) select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'u' || n || '@test.invalid' from generate_series(1, 6) n;
insert into public.profiles (id, full_name, email, role, branch_id, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'Owner', 'u1@test.invalid', 'owner', null, true),
  ('00000000-0000-0000-0000-000000000002', 'Manager A', 'u2@test.invalid', 'manager', 'aaaaaaaa-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000000003', 'Staff A', 'u3@test.invalid', 'staff', 'aaaaaaaa-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000000004', 'Manager B', 'u4@test.invalid', 'manager', 'bbbbbbbb-0000-0000-0000-000000000002', true),
  ('00000000-0000-0000-0000-000000000005', 'Staff B', 'u5@test.invalid', 'staff', 'bbbbbbbb-0000-0000-0000-000000000002', true),
  ('00000000-0000-0000-0000-000000000006', 'Former Staff A', 'u6@test.invalid', 'staff', 'aaaaaaaa-0000-0000-0000-000000000001', false);

insert into public.branch_hours (branch_id, weekday, opens_at, closes_at)
  select b.id, d, '09:00', '18:00' from public.branches b, generate_series(1, 6) d;
insert into public.branch_closures (branch_id, closed_on, reason) select id, '2026-12-25', 'Christmas Day' from public.branches;

insert into public.services (id, slug, name) values ('11111111-0000-0000-0000-000000000001', 'screen-repair', 'Screen repair');
insert into public.service_prices (service_id, device_type, from_price_pence, turnaround) values
  ('11111111-0000-0000-0000-000000000001', 'Phone', 2500, 'TEST');

insert into public.products (id, branch_id, slug, category, brand, model, price_pence, imei, status) values
  ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'test-phone-a', 'used_phone', 'TestBrand', 'Model A', 10000, '350000000000001', 'available'),
  ('cccccccc-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'test-phone-b', 'used_phone', 'TestBrand', 'Model B', 12000, '350000000000002', 'available'),
  ('cccccccc-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000002', 'test-phone-b-sold', 'used_phone', 'TestBrand', 'Model B2', 9000, '350000000000003', 'sold'),
  ('cccccccc-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'test-case-a', 'accessory', 'TestBrand', 'Case', 1500, null, 'available');
insert into public.product_photos (product_id, branch_id, storage_path)
  select id, branch_id, 'test/' || slug || '.webp' from public.products;

insert into public.enquiries (id, branch_id, type, customer_name, customer_phone, device_type, fault) values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'repair_quote', 'Test Customer A', '07000 000001', 'Phone', 'Screen repair'),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'repair_quote', 'Test Customer B', '07000 000002', 'Phone', 'Screen repair');
insert into public.site_events (event_type, branch_id, page_path, session_hash)
  select t, b.id, '/' || b.slug, 's1' from public.branches b, unnest(array['page_view', 'call_click', 'whatsapp_click']::public.site_event_type[]) t;

-- ---- Branch A, entered by Staff A --------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
-- Inv 1: 2 x 25.00 + 1 x 30.00, 10% discount, paid in full by cash. Linked to the enquiry.
select public.issue_repair_invoice('{"customer_name":"Test Customer A","customer_phone":"07000 000001","device_brand":"TestBrand","device_model":"Model A",
  "internal_parts_cost_pence":1000,"enquiry_id":"eeeeeeee-0000-0000-0000-00000000000a",
  "discount_kind":"percent","discount_value":1000,
  "lines":[{"description":"Screen","quantity":2,"unit_price_pence":2500},{"description":"Battery","quantity":1,"unit_price_pence":3000}],
  "payment_method":"cash","payment_amount_pence":7200}');
-- Inv 2: 100.00, part paid 40.00 by card. A forged branch_id must be ignored.
select public.issue_repair_invoice('{"branch_id":"bbbbbbbb-0000-0000-0000-000000000002","customer_name":"Test Customer A2","customer_phone":"07000 000003","device_model":"Model X",
  "lines":[{"description":"Repair","quantity":1,"unit_price_pence":10000}],"payment_method":"card","payment_amount_pence":4000}');
select public.issue_repair_invoice('{"customer_name":"Test Customer A3","customer_phone":"07000 000004","device_model":"Model Y",
  "lines":[{"description":"Repair","quantity":1,"unit_price_pence":5000}],"payment_method":"cash","payment_amount_pence":5000}');
select public.issue_repair_invoice('{"customer_name":"Test Customer A4","customer_phone":"07000 000005","device_model":"Model Z",
  "lines":[{"description":"Repair","quantity":1,"unit_price_pence":3000}],"payment_method":"cash","payment_amount_pence":3000}');
select public.issue_repair_invoice('{"customer_name":"Test Customer A5","customer_phone":"07000 000006","device_model":"Model W",
  "lines":[{"description":"Repair","quantity":1,"unit_price_pence":4000}],"payment_method":"card","payment_amount_pence":4000}');
select public.record_payment((select id from public.invoices where invoice_number like 'TSA-%-00002'), 'bank_transfer', 1000);
select public.record_other_sale('accessory', 'Case', 1500, 'cash', 'cccccccc-0000-0000-0000-00000000000d');
select public.record_other_sale('sim_topup', 'Top-up', 1000, 'card');
select public.record_other_sale('other', 'Entered by mistake', 999, 'cash');

-- ---- Branch A, corrections by Manager A --------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
-- Inv 3: credit note 20.00, paid out in cash against that credit note.
select public.record_refund(i.id, 'cash', 2000, 'Part refund',
         null, public.create_credit_note(i.id, 2000, 'Fault returned'))
  from public.invoices i where i.invoice_number like 'TSA-%-00003';
-- Inv 4: refunded in full, then cancelled.
select public.record_refund(id, 'cash', 3000, 'Entered in error') from public.invoices where invoice_number like 'TSA-%-00004';
select public.cancel_invoice(id, 'Entered in error') from public.invoices where invoice_number like 'TSA-%-00004';
-- Inv 5: goodwill refund 5.00 with no credit note.
select public.record_refund(id, 'card', 500, 'Goodwill') from public.invoices where invoice_number like 'TSA-%-00005';
select public.void_other_sale((select id from public.other_sales where description = 'Entered by mistake'), 'Mistake');
select public.record_expense((now() at time zone 'Europe/London')::date, 'shop_supplies', 'Cleaning', 1200, 'cash', 'daily');
select public.record_expense((now() at time zone 'Europe/London')::date, 'rent', 'Rent', 80000, 'bank_transfer', 'monthly');
select public.record_expense((now() at time zone 'Europe/London')::date, 'transport', 'Courier', 300, 'card', 'daily');
select public.void_expense(public.record_expense((now() at time zone 'Europe/London')::date, 'other', 'Mistake', 700, 'cash', 'daily'), 'Mistake');
select public.record_adjustment(
  public.submit_daily_closing((now() at time zone 'Europe/London')::date, 10000, 20400), 100, 'Found a note under the tray');

-- ---- Branch B ------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
select public.issue_repair_invoice('{"customer_name":"Test Customer B","customer_phone":"07000 000002","device_model":"Model B",
  "lines":[{"description":"Repair","quantity":1,"unit_price_pence":6000}],"payment_method":"cash","payment_amount_pence":6000}');
select public.record_other_sale('accessory', 'Charger', 2000, 'card');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select public.record_refund(i.id, 'cash', 100, 'Seed', null, public.create_credit_note(i.id, 100, 'Seed'))
  from public.invoices i where i.invoice_number like 'TSB-%-00001';
select public.record_expense((now() at time zone 'Europe/London')::date, 'shop_supplies', 'Cleaning', 500, 'cash', 'daily');
select public.record_adjustment(
  public.submit_daily_closing((now() at time zone 'Europe/London')::date, 5000, 10400), 1, 'Seed');
reset role;
select set_config('request.jwt.claim.sub', '', false);
