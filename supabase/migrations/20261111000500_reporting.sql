-- Reporting. Every figure on every dashboard, report and export comes from the
-- two functions below (SRS section 11). They run as the caller, so Row Level
-- Security limits a Manager to their own branch and lets the Owner see all.

-- Financial figures per branch for a range of London calendar days (inclusive).
create function public.report_financial(p_from date, p_to date, p_branch uuid default null)
returns table (
  branch_id uuid,
  invoice_count integer,
  repair_revenue_pence bigint,
  other_sales_pence bigint,
  gross_sales_pence bigint,
  refunds_pence bigint,
  net_sales_pence bigint,
  payments_cash_pence bigint,
  payments_card_pence bigint,
  payments_bank_transfer_pence bigint,
  payments_received_pence bigint,
  outstanding_pence bigint,
  expenses_pence bigint,
  operating_movement_pence bigint
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with b as (
    select id from public.branches
     where (p_branch is null or id = p_branch) and app.can_manage_branch(id)
  ),
  win as (select app.day_start(p_from) as t0, app.day_end(p_to) as t1),
  inv as (
    select i.branch_id, count(*)::integer as n, sum(i.total_pence)::bigint as total
      from public.invoices i, win
     where i.cancelled_at is null and i.issued_at >= win.t0 and i.issued_at < win.t1
     group by i.branch_id
  ),
  cn as (
    select c.branch_id, sum(c.amount_pence)::bigint as total
      from public.credit_notes c join public.invoices i on i.id = c.invoice_id, win
     where i.cancelled_at is null and c.created_at >= win.t0 and c.created_at < win.t1
     group by c.branch_id
  ),
  os as (
    select s.branch_id, sum(s.amount_pence)::bigint as total
      from public.other_sales s, win
     where s.voided_at is null and s.sold_at >= win.t0 and s.sold_at < win.t1
     group by s.branch_id
  ),
  -- A refund that pays out a credit note, or sits on a cancelled invoice, is not
  -- deducted again: the credit note or the cancellation already removed that revenue.
  rf as (
    select r.branch_id, sum(r.amount_pence)::bigint as total
      from public.refunds r join public.invoices i on i.id = r.invoice_id, win
     where r.credit_note_id is null and i.cancelled_at is null
       and r.refunded_at >= win.t0 and r.refunded_at < win.t1
     group by r.branch_id
  ),
  pay as (
    select pm.branch_id,
           sum(pm.amount_pence) filter (where pm.method = 'cash')::bigint as cash,
           sum(pm.amount_pence) filter (where pm.method = 'card')::bigint as card,
           sum(pm.amount_pence) filter (where pm.method = 'bank_transfer')::bigint as bank
      from public.payments pm left join public.other_sales s on s.id = pm.other_sale_id, win
     where s.voided_at is null and pm.received_at >= win.t0 and pm.received_at < win.t1
     group by pm.branch_id
  ),
  outs as (
    select ib.branch_id, sum(ib.outstanding_pence)::bigint as total
      from public.invoice_balances ib, win
     where ib.issued_at >= win.t0 and ib.issued_at < win.t1
     group by ib.branch_id
  ),
  ex as (
    select e.branch_id, sum(e.amount_pence)::bigint as total
      from public.expenses e
     where e.voided_at is null and e.expense_date between p_from and p_to
     group by e.branch_id
  )
  select
    b.id,
    coalesce(inv.n, 0),
    coalesce(inv.total, 0) - coalesce(cn.total, 0),
    coalesce(os.total, 0),
    coalesce(inv.total, 0) - coalesce(cn.total, 0) + coalesce(os.total, 0),
    coalesce(rf.total, 0),
    coalesce(inv.total, 0) - coalesce(cn.total, 0) + coalesce(os.total, 0) - coalesce(rf.total, 0),
    coalesce(pay.cash, 0), coalesce(pay.card, 0), coalesce(pay.bank, 0),
    coalesce(pay.cash, 0) + coalesce(pay.card, 0) + coalesce(pay.bank, 0),
    coalesce(outs.total, 0),
    coalesce(ex.total, 0),
    coalesce(inv.total, 0) - coalesce(cn.total, 0) + coalesce(os.total, 0) - coalesce(rf.total, 0) - coalesce(ex.total, 0)
  from b
  left join inv on inv.branch_id = b.id
  left join cn on cn.branch_id = b.id
  left join os on os.branch_id = b.id
  left join rf on rf.branch_id = b.id
  left join pay on pay.branch_id = b.id
  left join outs on outs.branch_id = b.id
  left join ex on ex.branch_id = b.id
$$;

-- Acquisition figures per branch for a range of London calendar days (inclusive).
-- An enquiry is "late" when it was still New 30 minutes after it arrived; the
-- application refines this against opening hours for the live inbox highlight.
create function public.report_acquisition(p_from date, p_to date, p_branch uuid default null)
returns table (
  branch_id uuid,
  sessions integer,
  call_clicks integer,
  whatsapp_clicks integer,
  directions_clicks integer,
  quote_starts integer,
  quote_submits integer,
  reserve_submits integer,
  enquiries integer,
  converted integer,
  late_enquiries integer,
  median_response_seconds integer
)
language sql stable security invoker set search_path = public, pg_temp as $$
  with b as (
    select id from public.branches
     where (p_branch is null or id = p_branch) and app.can_access_branch(id)
  ),
  win as (select app.day_start(p_from) as t0, app.day_end(p_to) as t1),
  ev as (
    select e.branch_id,
           count(distinct e.session_hash) filter (where e.event_type = 'page_view')::integer as sessions,
           count(*) filter (where e.event_type = 'call_click')::integer as calls,
           count(*) filter (where e.event_type = 'whatsapp_click')::integer as whatsapp,
           count(*) filter (where e.event_type = 'directions_click')::integer as directions,
           count(*) filter (where e.event_type = 'quote_start')::integer as quote_starts,
           count(*) filter (where e.event_type = 'quote_submit')::integer as quote_submits,
           count(*) filter (where e.event_type = 'reserve_submit')::integer as reserve_submits
      from public.site_events e, win
     where e.occurred_at >= win.t0 and e.occurred_at < win.t1
     group by e.branch_id
  ),
  en as (
    select q.branch_id,
           count(*) filter (where q.status <> 'spam')::integer as total,
           count(*) filter (where q.status = 'converted')::integer as converted,
           count(*) filter (where q.status <> 'spam'
             and coalesce(q.first_contacted_at, now()) - q.created_at > interval '30 minutes')::integer as late,
           (percentile_cont(0.5) within group (order by extract(epoch from q.first_contacted_at - q.created_at))
             filter (where q.first_contacted_at is not null))::integer as median_response
      from public.enquiries q, win
     where q.created_at >= win.t0 and q.created_at < win.t1
     group by q.branch_id
  )
  select b.id, coalesce(ev.sessions, 0), coalesce(ev.calls, 0), coalesce(ev.whatsapp, 0), coalesce(ev.directions, 0),
         coalesce(ev.quote_starts, 0), coalesce(ev.quote_submits, 0), coalesce(ev.reserve_submits, 0),
         coalesce(en.total, 0), coalesce(en.converted, 0), coalesce(en.late, 0), en.median_response
    from b
    left join ev on ev.branch_id = b.id
    left join en on en.branch_id = b.id
$$;

revoke execute on function public.report_financial(date, date, uuid), public.report_acquisition(date, date, uuid),
  public.cash_figures(uuid, date) from public, anon;
grant execute on function public.report_financial(date, date, uuid), public.report_acquisition(date, date, uuid),
  public.cash_figures(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- UK GDPR: the Owner erases a person's data across all branches by phone or email.
-- Unconverted enquiries are deleted. Customers with invoices are anonymised on the
-- customer record; the invoices themselves are kept for the legal retention period.
-- ---------------------------------------------------------------------------
create function public.erase_person(p_phone text, p_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_norm text := nullif(app.normalise_phone(p_phone), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_enquiries integer;
  v_customers integer;
begin
  if not app.is_owner() then
    raise exception 'Only the Owner can erase personal data' using errcode = '42501';
  end if;
  if v_norm is null and v_email is null then
    raise exception 'Give a phone number or an email address' using errcode = '22023';
  end if;
  delete from public.enquiries e
   where (app.normalise_phone(e.customer_phone) = v_norm or lower(e.customer_email) = v_email)
     and not exists (select 1 from public.repairs r where r.enquiry_id = e.id);
  get diagnostics v_enquiries = row_count;
  update public.customers c
     set name = 'Erased customer', phone = '', phone_normalised = null, email = null, erased_at = now()
   where (c.phone_normalised = v_norm or lower(c.email) = v_email) and c.erased_at is null;
  get diagnostics v_customers = row_count;
  perform app.audit('person_erased', 'customer', null, null,
    jsonb_build_object('enquiries_deleted', v_enquiries, 'customers_anonymised', v_customers));
  return jsonb_build_object('enquiries_deleted', v_enquiries, 'customers_anonymised', v_customers);
end $$;
revoke execute on function public.erase_person(text, text) from public, anon;

-- Retention: run on a schedule by the server (service role).
create function public.purge_expired_enquiries() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_months integer := (select enquiry_retention_months from public.business_settings where id);
  v_count integer;
begin
  delete from public.enquiries e
   where e.status <> 'converted' and e.created_at < now() - make_interval(months => v_months)
     and not exists (select 1 from public.repairs r where r.enquiry_id = e.id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.purge_expired_enquiries() from public, anon, authenticated;
grant execute on function public.purge_expired_enquiries() to service_role;
