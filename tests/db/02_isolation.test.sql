-- Branch isolation: every table that carries branch_id is checked automatically,
-- so a table added later without a policy fails this test.
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
create table test.branch_tables as
  select c.table_name::text as t from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
   where c.table_schema = 'public' and c.column_name = 'branch_id' and tb.table_type = 'BASE TABLE'
     -- Opening hours and holiday closures are public website content by design.
     and c.table_name not in ('branch_hours', 'branch_closures');
grant select on test.branch_tables to authenticated, anon;

-- The check is only meaningful if the other branch really has rows in every table.
do $$ declare r record; begin
  for r in select t from test.branch_tables loop
    if test.count_branch(r.t, 'bbbbbbbb-0000-0000-0000-000000000002') = 0 then
      raise exception 'FAIL fixture: no branch B rows in %', r.t;
    end if;
  end loop;
  raise notice 'ok   fixtures cover % branch-owned tables', (select count(*) from test.branch_tables);
end $$;

set role authenticated;
-- Staff A and Manager A see nothing of branch B, in any table.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select test.eq('staff A cannot read branch B ' || t, test.count_branch(t, :B), 0) from test.branch_tables;
select test.eq('staff A cannot read manager-only ' || t, test.count_branch(t, :A), 0)
  from unnest(array['expenses', 'daily_closings', 'adjustments', 'audit_logs']) t;
select test.eq('staff A reads own invoices', (select count(*) from public.invoices), 5);
with u as (update public.enquiries set outcome_note = 'x' where branch_id = :B returning 1)
  select test.eq('staff A update of a branch B enquiry touches nothing', (select count(*) from u), 0);
select test.fails('staff A cannot insert a branch B product',
  $$insert into public.products (branch_id, slug, category, brand, model, price_pence) values ('bbbbbbbb-0000-0000-0000-000000000002', 'x', 'accessory', 'x', 'x', 1)$$);
select test.fails('staff A cannot move an enquiry to branch B',
  $$update public.enquiries set branch_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'eeeeeeee-0000-0000-0000-00000000000a'$$);
select test.fails('staff A cannot refund', $$select public.record_refund((select id from public.invoices limit 1), 'cash', 1, 'x')$$);
select test.fails('staff A cannot cancel an invoice', $$select public.cancel_invoice((select id from public.invoices limit 1), 'x')$$);
select test.fails('staff A cannot record an expense', $$select public.record_expense(current_date, 'other', 'x', 1, 'cash', 'daily')$$);
select test.fails('staff A cannot submit a closing', $$select public.submit_daily_closing(current_date - 1, 0, 0)$$);
select test.fails('staff A cannot create a user', $$select public.create_profile(gen_random_uuid(), 'x', 'x@test.invalid', 'staff', 'aaaaaaaa-0000-0000-0000-000000000001')$$);
select test.eq('staff A gets no financial report rows', (select count(*) from public.report_financial(current_date, current_date)), 0);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select test.eq('manager A cannot read branch B ' || t, test.count_branch(t, :B), 0) from test.branch_tables;
select test.eq('manager A reads own expenses', (select count(*) from public.expenses), 4);
select test.eq('manager A financial report covers one branch', (select count(*) from public.report_financial(current_date, current_date)), 1);
select test.eq('manager A asking for branch B gets nothing', (select count(*) from public.report_financial(current_date, current_date, :B)), 0);
select test.fails('manager A cannot refund a branch B invoice',
  $$select public.record_refund('00000000-0000-0000-0000-0000000000ff', 'cash', 1, 'x')$$);
select test.fails('manager A cannot create a manager', $$select public.create_profile(gen_random_uuid(), 'x', 'x@test.invalid', 'manager', 'aaaaaaaa-0000-0000-0000-000000000001')$$);
select test.fails('manager A cannot create staff in branch B', $$select public.create_profile(gen_random_uuid(), 'x', 'x@test.invalid', 'staff', 'bbbbbbbb-0000-0000-0000-000000000002')$$);
select test.fails('manager A cannot change the branch code', $$update public.branches set code = 'ZZZ' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);
with u as (update public.branches set phone = 'x' where id = :B returning 1)
  select test.eq('manager A update of branch B touches nothing', (select count(*) from u), 0);

-- The Owner sees every branch in every table.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select test.eq('owner reads branch B ' || t, (test.count_branch(t, :B) > 0)::int, 1) from test.branch_tables;
select test.eq('owner financial report covers both branches', (select count(*) from public.report_financial(current_date, current_date)), 2);
update public.enquiries set branch_id = :A where id = 'eeeeeeee-0000-0000-0000-00000000000b';
select test.eq('owner can move an enquiry, with an event',
  (select count(*) from public.enquiry_events where enquiry_id = 'eeeeeeee-0000-0000-0000-00000000000b' and event_type = 'branch_moved'), 1);
update public.enquiries set branch_id = :B where id = 'eeeeeeee-0000-0000-0000-00000000000b';

-- A deactivated user keeps their history but sees nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', false);
select test.eq('deactivated user reads nothing from ' || t, (select test.count_branch(t, :A) + test.count_branch(t, :B)), 0)
  from test.branch_tables where t <> 'profiles';
select test.fails('deactivated user cannot issue an invoice',
  $$select public.issue_repair_invoice('{"customer_name":"x","customer_phone":"07000000000","device_model":"x","lines":[{"description":"x","quantity":1,"unit_price_pence":1}]}')$$);

-- Visitors: Available products only, never the IMEI, nothing internal.
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select test.eq('visitor sees available products only', (select count(*) from public.products), 2);
select test.fails('visitor cannot read IMEI', 'select imei from public.products');
select test.fails('visitor cannot read enquiries', 'select count(*) from public.enquiries');
select test.fails('visitor cannot read invoices', 'select count(*) from public.invoices');
select test.fails('visitor cannot read VAT settings', 'select vat_mode from public.business_settings');
select test.fails('visitor cannot call the rate limiter', $$select public.check_rate_limit('k', 'f', 1, 60)$$);
select test.eq('visitor reads public branch details', (select count(*) from public.branches), 2);
reset role;
select test.eq('the accessory sold through other sales left the public list',
  (select count(*) from public.products where id = 'cccccccc-0000-0000-0000-00000000000d' and status = 'sold'), 1);
