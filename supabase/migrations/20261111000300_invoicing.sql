-- Phase B: customers, completed repairs, invoices, payments, refunds, credit notes.
-- There is deliberately no repair status, stage or technician anywhere in this schema:
-- a repair row is written once, after the work is finished, together with its invoice.

create type public.payment_method as enum ('cash', 'card', 'bank_transfer');
create type public.discount_kind as enum ('none', 'amount', 'percent');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  phone text not null,
  -- Digits only, used for matching a returning customer within the branch.
  -- Null only after an erasure request has removed the number.
  phone_normalised text check (phone_normalised ~ '^[0-9]{6,15}$'),
  email text,
  erased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (erased_at is not null or phone_normalised is not null),
  unique (branch_id, phone_normalised)
);
create trigger customers_touch before update on public.customers
  for each row execute function app.touch_updated_at();

create function app.normalise_phone(p text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^44', '0')
$$;

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  device_brand text,
  device_model text not null,
  imei text,
  -- Never printed. Used for margin reporting only.
  internal_parts_cost_pence integer check (internal_parts_cost_pence >= 0),
  warranty_days integer check (warranty_days >= 0),
  enquiry_id uuid references public.enquiries (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  completed_at timestamptz not null default now()
);
create index repairs_branch_idx on public.repairs (branch_id, completed_at desc);
create index repairs_customer_idx on public.repairs (customer_id);

create table public.invoice_counters (
  branch_id uuid not null references public.branches (id) on delete restrict,
  year integer not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (branch_id, year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  repair_id uuid not null unique references public.repairs (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.profiles (id) on delete restrict,
  -- Snapshots: what was printed stays printed.
  issued_by_name text not null,
  customer_name text not null,
  customer_phone text not null,
  device_description text not null,
  imei text,
  warranty_days integer,
  vat_mode public.vat_mode not null,
  prices_include_vat boolean not null,
  subtotal_pence integer not null check (subtotal_pence >= 0),
  discount_kind public.discount_kind not null default 'none',
  discount_percent_bp integer check (discount_percent_bp between 0 and 10000),
  discount_pence integer not null default 0 check (discount_pence >= 0),
  tax_pence integer not null default 0 check (tax_pence >= 0),
  total_pence integer not null check (total_pence >= 0),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete restrict,
  cancel_reason text,
  check (discount_pence <= subtotal_pence),
  check ((cancelled_at is null) = (cancel_reason is null))
);
create index invoices_branch_issued_idx on public.invoices (branch_id, issued_at desc);
create index invoices_customer_idx on public.invoices (customer_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  position smallint not null,
  description text not null check (length(trim(description)) > 0),
  quantity integer not null check (quantity > 0),
  unit_price_pence integer not null check (unit_price_pence >= 0),
  line_total_pence integer not null check (line_total_pence >= 0),
  -- This line's share of the invoice discount.
  discount_pence integer not null default 0 check (discount_pence >= 0),
  -- Stored at issue so a later rate change never rewrites history.
  tax_rate_bp integer not null default 0,
  tax_pence integer not null default 0,
  unique (invoice_id, position)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete restrict,
  -- Foreign key added in the Phase C migration.
  other_sale_id uuid,
  method public.payment_method not null,
  amount_pence integer not null check (amount_pence > 0),
  received_at timestamptz not null default now(),
  received_by uuid not null references public.profiles (id) on delete restrict,
  -- Money arrives through exactly one source, so it can only ever be counted once.
  check ((invoice_id is not null)::int + (other_sale_id is not null)::int = 1)
);
create index payments_branch_time_idx on public.payments (branch_id, received_at desc);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_pence integer not null check (amount_pence > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index credit_notes_invoice_idx on public.credit_notes (invoice_id);
create index credit_notes_branch_time_idx on public.credit_notes (branch_id, created_at desc);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  -- Set when this refund pays out a credit note. Such a refund is not deducted
  -- from net sales a second time, because the credit note already reduced revenue.
  credit_note_id uuid references public.credit_notes (id) on delete restrict,
  method public.payment_method not null,
  amount_pence integer not null check (amount_pence > 0),
  reason text not null check (length(trim(reason)) > 0),
  refunded_by uuid not null references public.profiles (id) on delete restrict,
  refunded_at timestamptz not null default now()
);
create index refunds_invoice_idx on public.refunds (invoice_id);
create index refunds_branch_time_idx on public.refunds (branch_id, refunded_at desc);

-- ---------------------------------------------------------------------------
-- Immutability. These triggers bind every role, including the service role.
-- ---------------------------------------------------------------------------
create function app.guard_invoice_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'An issued invoice cannot be deleted' using errcode = 'P0001';
  end if;
  if old.cancelled_at is not null then
    raise exception 'A cancelled invoice cannot be changed' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
     is distinct from (to_jsonb(old) - 'cancelled_at' - 'cancelled_by' - 'cancel_reason') then
    raise exception 'An issued invoice cannot be edited. Cancel it or raise a credit note.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function app.guard_invoice_update();

create trigger invoice_lines_immutable before update or delete on public.invoice_lines
  for each row execute function app.forbid_change();
create trigger payments_immutable before update or delete on public.payments
  for each row execute function app.forbid_change();
create trigger refunds_immutable before update or delete on public.refunds
  for each row execute function app.forbid_change();
create trigger credit_notes_immutable before update or delete on public.credit_notes
  for each row execute function app.forbid_change();
create trigger repairs_immutable before update or delete on public.repairs
  for each row execute function app.forbid_change();
create trigger invoice_counters_no_delete before delete on public.invoice_counters
  for each row execute function app.forbid_change();

-- ---------------------------------------------------------------------------
-- Derived balances and payment status. security_invoker keeps RLS in force.
-- ---------------------------------------------------------------------------
create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.branch_id,
  i.invoice_number,
  i.issued_at,
  i.total_pence,
  coalesce(c.credited, 0)::integer as credited_pence,
  coalesce(p.paid, 0)::integer as paid_pence,
  coalesce(r.refunded, 0)::integer as refunded_pence,
  case when i.cancelled_at is not null then 0
       else greatest(i.total_pence - coalesce(c.credited, 0) - (coalesce(p.paid, 0) - coalesce(r.refunded, 0)), 0)
  end::integer as outstanding_pence,
  case
    when i.cancelled_at is not null then 'cancelled'
    when coalesce(r.refunded, 0) > 0 and coalesce(p.paid, 0) - coalesce(r.refunded, 0) <= 0 then 'refunded'
    when coalesce(p.paid, 0) - coalesce(r.refunded, 0) >= i.total_pence - coalesce(c.credited, 0) then 'paid'
    when coalesce(p.paid, 0) - coalesce(r.refunded, 0) > 0 then 'partially_paid'
    else 'unpaid'
  end as payment_status
from public.invoices i
left join lateral (select sum(amount_pence) as paid from public.payments where invoice_id = i.id) p on true
left join lateral (select sum(amount_pence) as refunded from public.refunds where invoice_id = i.id) r on true
left join lateral (select sum(amount_pence) as credited from public.credit_notes where invoice_id = i.id) c on true;

-- ---------------------------------------------------------------------------
-- issue_repair_invoice: completed repair + invoice + first payment, atomically.
-- Input shape:
--   { branch_id?, customer_name, customer_phone, customer_email?, device_brand?, device_model,
--     imei?, warranty_days?, internal_parts_cost_pence?, enquiry_id?,
--     discount_kind: none|amount|percent, discount_value?,   (pence, or basis points for percent)
--     lines: [{ description, quantity, unit_price_pence }],
--     payment_method?, payment_amount_pence? | paid_in_full? }
-- ---------------------------------------------------------------------------
create function public.issue_repair_invoice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role public.user_role := app.user_role();
  v_branch uuid;
  v_branch_row public.branches;
  v_settings public.business_settings;
  v_phone text := trim(coalesce(p->>'customer_phone', ''));
  v_phone_norm text := app.normalise_phone(p->>'customer_phone');
  v_customer uuid;
  v_repair uuid;
  v_invoice uuid;
  v_year integer := extract(year from now() at time zone 'Europe/London')::integer;
  v_seq integer;
  v_number text;
  v_line jsonb;
  v_n integer := coalesce(jsonb_array_length(p->'lines'), 0);
  v_subtotal bigint := 0;
  v_discount_kind public.discount_kind := coalesce(p->>'discount_kind', 'none')::public.discount_kind;
  v_discount_value bigint := coalesce((p->>'discount_value')::bigint, 0);
  v_discount bigint := 0;
  v_rate integer := 0;
  v_tax bigint := 0;
  v_total bigint;
  v_i integer := 0;
  v_line_total bigint;
  v_line_discount bigint;
  v_discount_left bigint;
  v_line_tax bigint;
  v_taxable bigint;
  v_pay bigint := coalesce((p->>'payment_amount_pence')::bigint, 0);
  v_warranty integer;
  v_enquiry uuid := nullif(p->>'enquiry_id', '')::uuid;
  v_line_discounts bigint[] := '{}';
  v_line_taxes bigint[] := '{}';
begin
  if v_role is null then
    raise exception 'Not signed in as an active user' using errcode = '42501';
  end if;

  -- Branch comes from the user's profile. Only the Owner, who has no branch, may name one.
  if v_role = 'owner' then
    v_branch := nullif(p->>'branch_id', '')::uuid;
    if v_branch is null then
      raise exception 'Choose a branch for this invoice' using errcode = '22023';
    end if;
  else
    v_branch := app.user_branch();
  end if;
  select * into v_branch_row from public.branches where id = v_branch;
  if not found then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p->>'customer_name', ''))) = 0 then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if v_phone_norm !~ '^[0-9]{6,15}$' then
    raise exception 'Enter a valid customer phone number' using errcode = '22023';
  end if;
  if length(trim(coalesce(p->>'device_model', ''))) = 0 then
    raise exception 'Device model is required' using errcode = '22023';
  end if;
  if v_n < 1 then
    raise exception 'Add at least one charge line' using errcode = '22023';
  end if;

  -- Totals, in integer pence throughout.
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    if length(trim(coalesce(v_line->>'description', ''))) = 0
       or coalesce((v_line->>'quantity')::integer, 0) < 1
       or coalesce((v_line->>'unit_price_pence')::bigint, -1) < 0 then
      raise exception 'Each charge line needs a description, a quantity of at least 1 and a price' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + (v_line->>'quantity')::integer * (v_line->>'unit_price_pence')::bigint;
  end loop;

  if v_discount_kind = 'amount' then
    v_discount := v_discount_value;
  elsif v_discount_kind = 'percent' then
    if v_discount_value < 0 or v_discount_value > 10000 then
      raise exception 'Discount percent must be between 0 and 100' using errcode = '22023';
    end if;
    v_discount := round(v_subtotal * v_discount_value / 10000.0);
  end if;
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Discount cannot be more than the charges' using errcode = '22023';
  end if;

  select * into v_settings from public.business_settings where id;
  if v_settings.vat_mode = 'standard' then
    v_rate := v_settings.vat_rate_bp;
  end if;

  -- Work out every line's discount share and tax first, so the invoice header
  -- is written once with its final figures and never touched again.
  v_discount_left := v_discount;
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    v_line_total := (v_line->>'quantity')::integer * (v_line->>'unit_price_pence')::bigint;
    -- Spread the discount in proportion; the last line takes the rounding remainder.
    if v_i = v_n then
      v_line_discount := v_discount_left;
    elsif v_subtotal > 0 then
      v_line_discount := least(round(v_discount * v_line_total / v_subtotal::numeric), v_discount_left);
    else
      v_line_discount := 0;
    end if;
    v_discount_left := v_discount_left - v_line_discount;
    v_taxable := v_line_total - v_line_discount;
    if v_rate = 0 then
      v_line_tax := 0;
    elsif v_settings.prices_include_vat then
      v_line_tax := round(v_taxable * v_rate / (10000.0 + v_rate));
    else
      v_line_tax := round(v_taxable * v_rate / 10000.0);
    end if;
    v_tax := v_tax + v_line_tax;
    v_line_discounts := v_line_discounts || v_line_discount;
    v_line_taxes := v_line_taxes || v_line_tax;
  end loop;

  v_total := v_subtotal - v_discount;
  if v_rate > 0 and not v_settings.prices_include_vat then
    v_total := v_total + v_tax;
  end if;
  -- "Paid in full" is the default at the till: the database, not the browser, supplies the amount.
  if coalesce((p->>'paid_in_full')::boolean, false) then
    v_pay := v_total;
  end if;
  if v_pay < 0 or v_pay > v_total then
    raise exception 'Payment cannot be more than the invoice total' using errcode = '22023';
  end if;
  if v_pay > 0 and p->>'payment_method' is null then
    raise exception 'Choose a payment method' using errcode = '22023';
  end if;

  -- Customer: match by phone within the branch, or create.
  insert into public.customers (branch_id, name, phone, phone_normalised, email)
  values (v_branch, trim(p->>'customer_name'), v_phone, v_phone_norm, nullif(trim(coalesce(p->>'customer_email', '')), ''))
  on conflict (branch_id, phone_normalised) do update
    set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer;

  v_warranty := coalesce((p->>'warranty_days')::integer, v_branch_row.default_warranty_days);

  insert into public.repairs (branch_id, customer_id, device_brand, device_model, imei,
                              internal_parts_cost_pence, warranty_days, enquiry_id, created_by)
  values (v_branch, v_customer, nullif(trim(coalesce(p->>'device_brand', '')), ''), trim(p->>'device_model'),
          nullif(trim(coalesce(p->>'imei', '')), ''), (p->>'internal_parts_cost_pence')::integer,
          v_warranty, v_enquiry, auth.uid())
  returning id into v_repair;

  -- Gapless number: the row lock taken here is held until commit, so concurrent
  -- issues for the same branch queue up, and a rollback releases the number.
  insert into public.invoice_counters (branch_id, year) values (v_branch, v_year)
  on conflict (branch_id, year) do nothing;
  update public.invoice_counters set last_number = last_number + 1
   where branch_id = v_branch and year = v_year
  returning last_number into v_seq;
  v_number := v_branch_row.code || '-' || v_year || '-' || lpad(v_seq::text, 5, '0');

  insert into public.invoices (branch_id, repair_id, customer_id, invoice_number, issued_by, issued_by_name,
                               customer_name, customer_phone, device_description, imei, warranty_days,
                               vat_mode, prices_include_vat, subtotal_pence, discount_kind, discount_percent_bp,
                               discount_pence, tax_pence, total_pence)
  select v_branch, v_repair, v_customer, v_number, auth.uid(),
         (select full_name from public.profiles where id = auth.uid()),
         trim(p->>'customer_name'), v_phone,
         trim(concat_ws(' ', nullif(trim(coalesce(p->>'device_brand', '')), ''), trim(p->>'device_model'))),
         nullif(trim(coalesce(p->>'imei', '')), ''), v_warranty,
         v_settings.vat_mode, v_settings.prices_include_vat, v_subtotal, v_discount_kind,
         case when v_discount_kind = 'percent' then v_discount_value::integer end,
         v_discount, v_tax, v_total
  returning id into v_invoice;

  v_i := 0;
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    insert into public.invoice_lines (invoice_id, branch_id, position, description, quantity, unit_price_pence,
                                      line_total_pence, discount_pence, tax_rate_bp, tax_pence)
    values (v_invoice, v_branch, v_i, trim(v_line->>'description'), (v_line->>'quantity')::integer,
            (v_line->>'unit_price_pence')::integer,
            (v_line->>'quantity')::integer * (v_line->>'unit_price_pence')::bigint,
            v_line_discounts[v_i], v_rate, v_line_taxes[v_i]);
  end loop;

  if v_pay > 0 then
    insert into public.payments (branch_id, invoice_id, method, amount_pence, received_by)
    values (v_branch, v_invoice, (p->>'payment_method')::public.payment_method, v_pay, auth.uid());
  end if;

  -- Linking a completed repair marks its enquiry Converted (same branch only).
  if v_enquiry is not null then
    update public.enquiries set status = 'converted', sale_value_pence = v_total
     where id = v_enquiry and branch_id = v_branch;
    if not found then
      raise exception 'Linked enquiry not found in this branch' using errcode = 'P0002';
    end if;
  end if;

  perform app.audit('invoice_issued', 'invoice', v_invoice::text, v_branch,
    jsonb_build_object('invoice_number', v_number, 'total_pence', v_total));
  if v_pay > 0 then
    perform app.audit('payment_recorded', 'invoice', v_invoice::text, v_branch,
      jsonb_build_object('amount_pence', v_pay, 'method', p->>'payment_method'));
  end if;

  return jsonb_build_object('invoice_id', v_invoice, 'invoice_number', v_number, 'total_pence', v_total);
end $$;

-- ---------------------------------------------------------------------------
-- Later payments, cancellation, credit notes, refunds
-- ---------------------------------------------------------------------------
create function app.lock_invoice(p_invoice uuid) returns public.invoices
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice for update;
  if not found or not app.can_access_branch(v.branch_id) then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  return v;
end $$;

create function public.record_payment(p_invoice uuid, p_method public.payment_method, p_amount_pence integer)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.invoices := app.lock_invoice(p_invoice);
  v_outstanding integer;
  v_id uuid;
begin
  if v.cancelled_at is not null then
    raise exception 'This invoice is cancelled' using errcode = '22023';
  end if;
  select outstanding_pence into v_outstanding from public.invoice_balances where invoice_id = p_invoice;
  if p_amount_pence is null or p_amount_pence <= 0 or p_amount_pence > v_outstanding then
    raise exception 'Payment must be between 1p and the outstanding balance' using errcode = '22023';
  end if;
  insert into public.payments (branch_id, invoice_id, method, amount_pence, received_by)
  values (v.branch_id, p_invoice, p_method, p_amount_pence, auth.uid())
  returning id into v_id;
  perform app.audit('payment_recorded', 'invoice', p_invoice::text, v.branch_id,
    jsonb_build_object('amount_pence', p_amount_pence, 'method', p_method));
  return v_id;
end $$;

create function public.cancel_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.invoices := app.lock_invoice(p_invoice);
  v_net integer;
begin
  if not app.can_manage_branch(v.branch_id) then
    raise exception 'Only a Manager or the Owner can cancel an invoice' using errcode = '42501';
  end if;
  if v.cancelled_at is not null then
    raise exception 'This invoice is already cancelled' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select paid_pence - refunded_pence into v_net from public.invoice_balances where invoice_id = p_invoice;
  if v_net > 0 then
    raise exception 'Refund the money received before cancelling this invoice' using errcode = '22023';
  end if;
  update public.invoices set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_invoice;
  perform app.audit('invoice_cancelled', 'invoice', p_invoice::text, v.branch_id,
    jsonb_build_object('invoice_number', v.invoice_number, 'reason', trim(p_reason)));
end $$;

create function public.create_credit_note(p_invoice uuid, p_amount_pence integer, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.invoices := app.lock_invoice(p_invoice);
  v_credited integer;
  v_id uuid;
begin
  if not app.can_manage_branch(v.branch_id) then
    raise exception 'Only a Manager or the Owner can raise a credit note' using errcode = '42501';
  end if;
  if v.cancelled_at is not null then
    raise exception 'This invoice is cancelled' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select credited_pence into v_credited from public.invoice_balances where invoice_id = p_invoice;
  if p_amount_pence is null or p_amount_pence <= 0 or p_amount_pence > v.total_pence - v_credited then
    raise exception 'Credit must be between 1p and the uncredited invoice total' using errcode = '22023';
  end if;
  insert into public.credit_notes (branch_id, invoice_id, amount_pence, reason, created_by)
  values (v.branch_id, p_invoice, p_amount_pence, trim(p_reason), auth.uid())
  returning id into v_id;
  perform app.audit('credit_note_created', 'invoice', p_invoice::text, v.branch_id,
    jsonb_build_object('credit_note_id', v_id, 'amount_pence', p_amount_pence, 'reason', trim(p_reason)));
  return v_id;
end $$;

create function public.record_refund(p_invoice uuid, p_method public.payment_method, p_amount_pence integer,
                                     p_reason text, p_payment uuid default null, p_credit_note uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.invoices := app.lock_invoice(p_invoice);
  v_net integer;
  v_id uuid;
begin
  if not app.can_manage_branch(v.branch_id) then
    raise exception 'Only a Manager or the Owner can refund' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select paid_pence - refunded_pence into v_net from public.invoice_balances where invoice_id = p_invoice;
  if p_amount_pence is null or p_amount_pence <= 0 or p_amount_pence > v_net then
    raise exception 'Refund must be between 1p and the money received on this invoice' using errcode = '22023';
  end if;
  if p_payment is not null and not exists
     (select 1 from public.payments where id = p_payment and invoice_id = p_invoice) then
    raise exception 'That payment does not belong to this invoice' using errcode = '22023';
  end if;
  if p_credit_note is not null then
    if not exists (select 1 from public.credit_notes where id = p_credit_note and invoice_id = p_invoice) then
      raise exception 'That credit note does not belong to this invoice' using errcode = '22023';
    end if;
    if p_amount_pence > (select c.amount_pence - coalesce((select sum(r.amount_pence) from public.refunds r
                                                             where r.credit_note_id = c.id), 0)
                           from public.credit_notes c where c.id = p_credit_note) then
      raise exception 'Refund is more than the credit note has left' using errcode = '22023';
    end if;
  end if;
  insert into public.refunds (branch_id, invoice_id, payment_id, credit_note_id, method, amount_pence, reason, refunded_by)
  values (v.branch_id, p_invoice, p_payment, p_credit_note, p_method, p_amount_pence, trim(p_reason), auth.uid())
  returning id into v_id;
  perform app.audit('refund_recorded', 'invoice', p_invoice::text, v.branch_id,
    jsonb_build_object('refund_id', v_id, 'amount_pence', p_amount_pence, 'method', p_method, 'reason', trim(p_reason)));
  return v_id;
end $$;

revoke execute on function app.lock_invoice(uuid) from public, anon;
revoke execute on function public.issue_repair_invoice(jsonb), public.record_payment(uuid, public.payment_method, integer),
  public.cancel_invoice(uuid, text), public.create_credit_note(uuid, integer, text),
  public.record_refund(uuid, public.payment_method, integer, text, uuid, uuid) from public, anon;
grant execute on function public.issue_repair_invoice(jsonb), public.record_payment(uuid, public.payment_method, integer),
  public.cancel_invoice(uuid, text), public.create_credit_note(uuid, integer, text),
  public.record_refund(uuid, public.payment_method, integer, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: the branch reads; nobody writes except through the functions above.
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.repairs enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.credit_notes enable row level security;
alter table public.refunds enable row level security;

create policy customers_read on public.customers for select to authenticated using (app.can_access_branch(branch_id));
create policy customers_update on public.customers for update to authenticated
  using (app.can_access_branch(branch_id)) with check (app.can_access_branch(branch_id));
create policy repairs_read on public.repairs for select to authenticated using (app.can_access_branch(branch_id));
create policy invoice_counters_read on public.invoice_counters for select to authenticated using (app.can_access_branch(branch_id));
create policy invoices_read on public.invoices for select to authenticated using (app.can_access_branch(branch_id));
create policy invoice_lines_read on public.invoice_lines for select to authenticated using (app.can_access_branch(branch_id));
create policy payments_read on public.payments for select to authenticated using (app.can_access_branch(branch_id));
create policy credit_notes_read on public.credit_notes for select to authenticated using (app.can_access_branch(branch_id));
create policy refunds_read on public.refunds for select to authenticated using (app.can_access_branch(branch_id));

revoke all on public.customers, public.repairs, public.invoice_counters, public.invoices, public.invoice_lines,
  public.payments, public.credit_notes, public.refunds, public.invoice_balances from anon;
revoke insert, delete on public.customers from authenticated;
revoke insert, update, delete on public.repairs, public.invoice_counters, public.invoices, public.invoice_lines,
  public.payments, public.credit_notes, public.refunds from authenticated;
grant select on public.invoice_balances to authenticated;
