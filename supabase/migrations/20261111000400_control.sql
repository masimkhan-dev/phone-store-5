-- Phase C: other sales, expenses, optional daily closing, adjustments.
-- The application screens for this phase are built only after the client confirms
-- there is no existing POS already holding this data (SRS section 9).

create type public.other_sale_category as enum ('new_phone', 'used_phone', 'accessory', 'sim_topup', 'unlocking', 'other');
create type public.expense_category as enum
  ('rent', 'utilities', 'internet', 'salaries', 'parts_materials', 'transport', 'shop_supplies', 'maintenance', 'marketing', 'other');
create type public.expense_frequency as enum ('daily', 'monthly');

create table public.other_sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  category public.other_sale_category not null,
  description text not null check (length(trim(description)) > 0),
  amount_pence integer not null check (amount_pence > 0),
  product_id uuid references public.products (id) on delete restrict,
  sold_by uuid not null references public.profiles (id) on delete restrict,
  sold_at timestamptz not null default now(),
  -- A mistaken entry is voided with a reason, never deleted.
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete restrict,
  void_reason text,
  check ((voided_at is null) = (void_reason is null))
);
create index other_sales_branch_time_idx on public.other_sales (branch_id, sold_at desc);

alter table public.payments
  add constraint payments_other_sale_fk foreign key (other_sale_id) references public.other_sales (id) on delete restrict;
create index payments_other_sale_idx on public.payments (other_sale_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  expense_date date not null,
  category public.expense_category not null,
  description text not null check (length(trim(description)) > 0),
  amount_pence integer not null check (amount_pence > 0),
  method public.payment_method not null,
  frequency public.expense_frequency not null default 'daily',
  receipt_path text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete restrict,
  void_reason text,
  check ((voided_at is null) = (void_reason is null))
);
create index expenses_branch_date_idx on public.expenses (branch_id, expense_date desc);

create table public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  closing_date date not null,
  opening_cash_pence integer not null check (opening_cash_pence >= 0),
  counted_cash_pence integer not null check (counted_cash_pence >= 0),
  -- Derived from recorded transactions at the moment of submission.
  cash_received_pence integer not null,
  cash_expenses_pence integer not null,
  cash_refunds_pence integer not null,
  expected_cash_pence integer not null,
  variance_pence integer not null,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (branch_id, closing_date)
);

create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  daily_closing_id uuid not null references public.daily_closings (id) on delete restrict,
  -- Signed correction to the counted cash.
  amount_pence integer not null check (amount_pence <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Void is the only permitted change to a sale or expense.
create function app.guard_void_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Financial records cannot be deleted' using errcode = 'P0001';
  end if;
  if old.voided_at is not null
     or (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
        is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'This record cannot be edited. Void it with a reason instead.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger other_sales_void_only before update or delete on public.other_sales
  for each row execute function app.guard_void_only();
create trigger expenses_void_only before update or delete on public.expenses
  for each row execute function app.guard_void_only();
create trigger daily_closings_immutable before update or delete on public.daily_closings
  for each row execute function app.forbid_change();
create trigger adjustments_immutable before update or delete on public.adjustments
  for each row execute function app.forbid_change();

-- London calendar day boundaries as UTC instants.
create function app.day_start(p_day date) returns timestamptz
language sql immutable as $$ select (p_day::timestamp at time zone 'Europe/London') $$;
create function app.day_end(p_day date) returns timestamptz
language sql immutable as $$ select ((p_day + 1)::timestamp at time zone 'Europe/London') $$;

-- Cash movements for one branch on one London day. The single definition used by
-- the closing screen, the closing submission and the reports.
create function public.cash_figures(p_branch uuid, p_day date)
returns table (cash_received_pence integer, cash_expenses_pence integer, cash_refunds_pence integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    coalesce((select sum(pm.amount_pence) from public.payments pm
               left join public.other_sales os on os.id = pm.other_sale_id
              where pm.branch_id = p_branch and pm.method = 'cash'
                and pm.received_at >= app.day_start(p_day) and pm.received_at < app.day_end(p_day)
                and os.voided_at is null), 0)::integer,
    -- Monthly expenses (rent, salaries) are left out of daily cash figures.
    coalesce((select sum(e.amount_pence) from public.expenses e
              where e.branch_id = p_branch and e.method = 'cash' and e.frequency = 'daily'
                and e.expense_date = p_day and e.voided_at is null), 0)::integer,
    coalesce((select sum(r.amount_pence) from public.refunds r
              where r.branch_id = p_branch and r.method = 'cash'
                and r.refunded_at >= app.day_start(p_day) and r.refunded_at < app.day_end(p_day)), 0)::integer
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
create function public.record_other_sale(p_category public.other_sale_category, p_description text,
                                         p_amount_pence integer, p_method public.payment_method,
                                         p_product uuid default null, p_branch uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role public.user_role := app.user_role();
  v_branch uuid;
  v_id uuid;
begin
  if v_role is null then
    raise exception 'Not signed in as an active user' using errcode = '42501';
  end if;
  v_branch := case when v_role = 'owner' then p_branch else app.user_branch() end;
  if v_branch is null then
    raise exception 'Choose a branch for this sale' using errcode = '22023';
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'Enter the sale amount' using errcode = '22023';
  end if;
  if p_product is not null then
    update public.products set status = 'sold'
     where id = p_product and branch_id = v_branch and status <> 'sold';
    if not found then
      raise exception 'That catalogue item is not available in this branch' using errcode = '22023';
    end if;
  end if;
  insert into public.other_sales (branch_id, category, description, amount_pence, product_id, sold_by)
  values (v_branch, p_category, trim(p_description), p_amount_pence, p_product, auth.uid())
  returning id into v_id;
  insert into public.payments (branch_id, other_sale_id, method, amount_pence, received_by)
  values (v_branch, v_id, p_method, p_amount_pence, auth.uid());
  perform app.audit('other_sale_recorded', 'other_sale', v_id::text, v_branch,
    jsonb_build_object('amount_pence', p_amount_pence, 'category', p_category, 'method', p_method));
  return v_id;
end $$;

create function public.void_other_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.other_sales;
begin
  select * into v from public.other_sales where id = p_sale for update;
  if not found or not app.can_manage_branch(v.branch_id) then
    raise exception 'Sale not found, or you are not allowed to void it' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.other_sales set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_sale;
  perform app.audit('other_sale_voided', 'other_sale', p_sale::text, v.branch_id, jsonb_build_object('reason', trim(p_reason)));
end $$;

create function public.record_expense(p_date date, p_category public.expense_category, p_description text,
                                      p_amount_pence integer, p_method public.payment_method,
                                      p_frequency public.expense_frequency, p_receipt_path text default null,
                                      p_branch uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_branch uuid := case when app.is_owner() then p_branch else app.user_branch() end;
  v_id uuid;
begin
  if v_branch is null or not app.can_manage_branch(v_branch) then
    raise exception 'Only a Manager or the Owner can record expenses' using errcode = '42501';
  end if;
  insert into public.expenses (branch_id, expense_date, category, description, amount_pence, method, frequency, receipt_path, created_by)
  values (v_branch, p_date, p_category, trim(p_description), p_amount_pence, p_method, p_frequency, p_receipt_path, auth.uid())
  returning id into v_id;
  perform app.audit('expense_recorded', 'expense', v_id::text, v_branch,
    jsonb_build_object('amount_pence', p_amount_pence, 'category', p_category, 'frequency', p_frequency));
  return v_id;
end $$;

create function public.void_expense(p_expense uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.expenses;
begin
  select * into v from public.expenses where id = p_expense for update;
  if not found or not app.can_manage_branch(v.branch_id) then
    raise exception 'Expense not found, or you are not allowed to void it' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.expenses set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_expense;
  perform app.audit('expense_voided', 'expense', p_expense::text, v.branch_id, jsonb_build_object('reason', trim(p_reason)));
end $$;

-- A closing is a cash count check. It creates no sales or payment records and is final at once.
create function public.submit_daily_closing(p_day date, p_opening_pence integer, p_counted_pence integer, p_branch uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_branch uuid := case when app.is_owner() then p_branch else app.user_branch() end;
  v_cash record;
  v_expected integer;
  v_id uuid;
begin
  if v_branch is null or not app.can_manage_branch(v_branch) then
    raise exception 'Only a Manager or the Owner can submit a closing' using errcode = '42501';
  end if;
  if p_day > (now() at time zone 'Europe/London')::date then
    raise exception 'A closing cannot be submitted for a future day' using errcode = '22023';
  end if;
  select * into v_cash from public.cash_figures(v_branch, p_day);
  v_expected := p_opening_pence + v_cash.cash_received_pence - v_cash.cash_expenses_pence - v_cash.cash_refunds_pence;
  insert into public.daily_closings (branch_id, closing_date, opening_cash_pence, counted_cash_pence,
                                     cash_received_pence, cash_expenses_pence, cash_refunds_pence,
                                     expected_cash_pence, variance_pence, submitted_by)
  values (v_branch, p_day, p_opening_pence, p_counted_pence, v_cash.cash_received_pence, v_cash.cash_expenses_pence,
          v_cash.cash_refunds_pence, v_expected, p_counted_pence - v_expected, auth.uid())
  returning id into v_id;
  perform app.audit('closing_submitted', 'daily_closing', v_id::text, v_branch,
    jsonb_build_object('date', p_day, 'variance_pence', p_counted_pence - v_expected));
  return v_id;
exception when unique_violation then
  raise exception 'A closing has already been submitted for this day. Record an adjustment instead.' using errcode = '23505';
end $$;

create function public.record_adjustment(p_closing uuid, p_amount_pence integer, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.daily_closings;
  v_id uuid;
begin
  select * into v from public.daily_closings where id = p_closing;
  if not found or not app.can_manage_branch(v.branch_id) then
    raise exception 'Closing not found, or you are not allowed to adjust it' using errcode = '42501';
  end if;
  insert into public.adjustments (branch_id, daily_closing_id, amount_pence, reason, created_by)
  values (v.branch_id, p_closing, p_amount_pence, trim(p_reason), auth.uid())
  returning id into v_id;
  perform app.audit('adjustment_recorded', 'daily_closing', p_closing::text, v.branch_id,
    jsonb_build_object('amount_pence', p_amount_pence, 'reason', trim(p_reason)));
  return v_id;
end $$;

revoke execute on function public.record_other_sale(public.other_sale_category, text, integer, public.payment_method, uuid, uuid),
  public.void_other_sale(uuid, text),
  public.record_expense(date, public.expense_category, text, integer, public.payment_method, public.expense_frequency, text, uuid),
  public.void_expense(uuid, text), public.submit_daily_closing(date, integer, integer, uuid),
  public.record_adjustment(uuid, integer, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.other_sales enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_closings enable row level security;
alter table public.adjustments enable row level security;

create policy other_sales_read on public.other_sales for select to authenticated using (app.can_access_branch(branch_id));
-- Expenses, closings and adjustments are Manager and Owner only.
create policy expenses_read on public.expenses for select to authenticated using (app.can_manage_branch(branch_id));
create policy daily_closings_read on public.daily_closings for select to authenticated using (app.can_manage_branch(branch_id));
create policy adjustments_read on public.adjustments for select to authenticated using (app.can_manage_branch(branch_id));

revoke all on public.other_sales, public.expenses, public.daily_closings, public.adjustments from anon;
revoke insert, update, delete on public.other_sales, public.expenses, public.daily_closings, public.adjustments from authenticated;
