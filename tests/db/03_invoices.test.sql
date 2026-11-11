-- Invoice numbering, totals, immutability, payment status.
select test.eq('branch A numbers are 1..5 with no gaps',
  (select count(*) from public.invoices i join generate_series(1, 5) n
     on i.invoice_number = 'TSA-' || extract(year from now() at time zone 'Europe/London')::int || '-' || lpad(n::text, 5, '0')), 5);
select test.eq('forged branch_id was ignored: branch B has one invoice', (select count(*) from public.invoices where branch_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 1);
select test.eq('inv 1 subtotal', (select subtotal_pence from public.invoices where invoice_number like 'TSA-%-00001'), 8000);
select test.eq('inv 1 discount 10%', (select discount_pence from public.invoices where invoice_number like 'TSA-%-00001'), 800);
select test.eq('inv 1 total', (select total_pence from public.invoices where invoice_number like 'TSA-%-00001'), 7200);
select test.eq('inv 1 line discounts add up to the invoice discount',
  (select sum(l.discount_pence) from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where i.invoice_number like 'TSA-%-00001'), 800);
select test.eq('inv 1 took the branch default warranty', (select warranty_days from public.invoices where invoice_number like 'TSA-%-00001'), 90);
select test.eq('linked enquiry became Converted',
  (select count(*) from public.enquiries where id = 'eeeeeeee-0000-0000-0000-00000000000a' and status = 'converted' and sale_value_pence = 7200), 1);
select test.eq('returning customer is matched by phone, not duplicated',
  (select count(*) from public.customers where branch_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 5);

create temp view st as select right(invoice_number, 5) as n, payment_status, outstanding_pence from public.invoice_balances where invoice_number like 'TSA-%';
select test.eq('inv 1 paid', (select count(*) from st where n = '00001' and payment_status = 'paid' and outstanding_pence = 0), 1);
select test.eq('inv 2 partially paid, 50.00 outstanding after second payment', (select count(*) from st where n = '00002' and payment_status = 'partially_paid' and outstanding_pence = 5000), 1);
select test.eq('inv 3 paid after credit note and its refund', (select count(*) from st where n = '00003' and payment_status = 'paid' and outstanding_pence = 0), 1);
select test.eq('inv 4 cancelled', (select count(*) from st where n = '00004' and payment_status = 'cancelled' and outstanding_pence = 0), 1);

-- Closing the part payment.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select test.fails('payment above the outstanding balance is rejected',
  $$select public.record_payment((select id from public.invoices where invoice_number like 'TSA-%-00002'), 'cash', 5001)$$);
select test.fails('payment on a cancelled invoice is rejected',
  $$select public.record_payment((select id from public.invoices where invoice_number like 'TSA-%-00004'), 'cash', 1)$$);
select test.fails('an invoice needs at least one line',
  $$select public.issue_repair_invoice('{"customer_name":"x","customer_phone":"07000000000","device_model":"x","lines":[]}')$$);
select test.fails('payment above the total is rejected and leaves no invoice behind',
  $$select public.issue_repair_invoice('{"customer_name":"x","customer_phone":"07000000009","device_model":"x","lines":[{"description":"x","quantity":1,"unit_price_pence":100}],"payment_method":"cash","payment_amount_pence":101}')$$);
select test.fails('staff cannot update an invoice directly', $$update public.invoices set total_pence = 1$$);
reset role;
select test.eq('a rejected issue did not consume a number',
  (select last_number from public.invoice_counters where branch_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 5);

-- Immutability holds for every role, including a superuser session.
select test.fails('invoice total cannot be edited', $$update public.invoices set total_pence = 1 where invoice_number like 'TSA-%-00001'$$);
select test.fails('invoice cannot be deleted', $$delete from public.invoices where invoice_number like 'TSA-%-00001'$$);
select test.fails('invoice line cannot be edited', $$update public.invoice_lines set unit_price_pence = 1$$);
select test.fails('payment cannot be deleted', $$delete from public.payments$$);
select test.fails('refund cannot be edited', $$update public.refunds set amount_pence = 1$$);
select test.fails('credit note cannot be deleted', $$delete from public.credit_notes$$);
select test.fails('closing cannot be edited', $$update public.daily_closings set counted_cash_pence = 1$$);
select test.fails('other sale cannot be edited', $$update public.other_sales set amount_pence = 1$$);
select test.fails('expense cannot be deleted', $$delete from public.expenses$$);
select test.fails('audit log cannot be edited', $$update public.audit_logs set action = 'x'$$);
select test.fails('a cancelled invoice cannot be un-cancelled',
  $$update public.invoices set cancelled_at = null, cancelled_by = null, cancel_reason = null where invoice_number like 'TSA-%-00004'$$);

-- Every action in SRS 13.2 exercised by the fixtures wrote an audit record.
select test.eq('audit: ' || a, (select (count(*) > 0)::int from public.audit_logs where action = a), 1)
  from unnest(array['invoice_issued', 'payment_recorded', 'invoice_cancelled', 'credit_note_created', 'refund_recorded',
                    'expense_recorded', 'closing_submitted', 'adjustment_recorded', 'other_sale_recorded',
                    'enquiry_reassigned', 'price_list_insert']) a;
select test.eq('audit keeps the user name', (select count(*) from public.audit_logs where user_id is not null and user_name is null), 0);
