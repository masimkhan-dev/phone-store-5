-- Phase A: website content, catalogue, enquiries, first-party tracking, redirects.

create type public.product_category as enum ('new_phone', 'used_phone', 'accessory', 'sim');
create type public.product_status as enum ('available', 'reserved', 'sold', 'hidden');
create type public.enquiry_type as enum ('repair_quote', 'reserve_collect', 'sell_phone', 'general');
create type public.enquiry_status as enum ('new', 'contacted', 'quoted', 'converted', 'not_converted', 'spam');
create type public.site_event_type as enum
  ('page_view', 'call_click', 'whatsapp_click', 'directions_click', 'quote_start', 'quote_submit', 'reserve_submit');

-- ---------------------------------------------------------------------------
-- Central content, managed by the Owner
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_description text,
  description text,
  seo_text text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_touch before update on public.services
  for each row execute function app.touch_updated_at();

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  device_type text not null check (length(trim(device_type)) > 0),
  from_price_pence integer not null check (from_price_pence >= 0),
  turnaround text,
  updated_at timestamptz not null default now(),
  unique (service_id, device_type)
);
create trigger service_prices_touch before update on public.service_prices
  for each row execute function app.touch_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  service_id uuid references public.services (id) on delete set null,
  is_published boolean not null default true,
  sort_order integer not null default 0
);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  link_url text,
  link_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique check (from_path like '/%'),
  to_path text not null check (to_path like '/%' and to_path <> from_path),
  created_at timestamptz not null default now()
);

-- Price list changes are audited (SRS 13.2).
create function app.audit_price_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.audit('price_list_' || lower(tg_op), tg_table_name,
    coalesce(new.id, old.id)::text, null,
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  return coalesce(new, old);
end $$;
create trigger service_prices_audit after insert or update or delete on public.service_prices
  for each row execute function app.audit_price_change();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function app.audit_price_change();

-- ---------------------------------------------------------------------------
-- Catalogue: a per-branch display list, not stock control
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  slug text not null unique,
  category public.product_category not null,
  brand text not null,
  model text not null,
  storage text,
  colour text,
  condition_grade text,
  battery_health_pct smallint check (battery_health_pct between 0 and 100),
  price_pence integer not null check (price_pence >= 0),
  warranty_months smallint check (warranty_months >= 0),
  description text,
  -- Internal only. Never granted to the anon role.
  imei text,
  status public.product_status not null default 'available',
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_branch_status_idx on public.products (branch_id, status);
create index products_public_idx on public.products (status, category, created_at desc);
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();

create table public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index product_photos_product_idx on public.product_photos (product_id, sort_order);

create function app.guard_product_photo() returns trigger
language plpgsql as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from public.products where id = new.product_id;
  if v_branch is distinct from new.branch_id then
    raise exception 'Photo branch must match its product' using errcode = '23514';
  end if;
  if (select count(*) from public.product_photos where product_id = new.product_id) >= 6 then
    raise exception 'A product can have at most six photos' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger product_photos_guard before insert on public.product_photos
  for each row execute function app.guard_product_photo();

-- ---------------------------------------------------------------------------
-- Enquiries
-- ---------------------------------------------------------------------------
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  type public.enquiry_type not null,
  status public.enquiry_status not null default 'new',
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (length(trim(customer_phone)) > 0),
  customer_email text,
  device_type text,
  device_brand text,
  device_model text,
  fault text,
  service_id uuid references public.services (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  storage text,
  condition text,
  message text,
  source_url text,
  landing_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  marketing_consent boolean not null default false,
  assigned_to uuid references public.profiles (id) on delete restrict,
  outcome_note text,
  sale_value_pence integer check (sale_value_pence >= 0),
  first_contacted_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'repair_quote' or (device_type is not null and fault is not null)),
  check (type <> 'reserve_collect' or product_id is not null),
  check (type <> 'sell_phone' or (device_model is not null and condition is not null))
);
create index enquiries_branch_status_idx on public.enquiries (branch_id, status, created_at desc);
create index enquiries_created_idx on public.enquiries (created_at desc);
create index enquiries_phone_idx on public.enquiries (customer_phone);

create table public.enquiry_events (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete restrict,
  event_type text not null check (event_type in ('created', 'status_changed', 'note', 'assigned', 'branch_moved')),
  from_status public.enquiry_status,
  to_status public.enquiry_status,
  note text,
  created_at timestamptz not null default now()
);
create index enquiry_events_enquiry_idx on public.enquiry_events (enquiry_id, created_at);

-- Every status change, assignment and branch move gets a timestamped event.
create function app.track_enquiry() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enquiry_events (enquiry_id, branch_id, user_id, event_type, to_status)
    values (new.id, new.branch_id, auth.uid(), 'created', new.status);
    return new;
  end if;

  if new.branch_id is distinct from old.branch_id then
    if not app.is_owner() then
      raise exception 'Only the Owner can move an enquiry to another branch' using errcode = '42501';
    end if;
    new.assigned_to := null;
    insert into public.enquiry_events (enquiry_id, branch_id, user_id, event_type, note)
    values (new.id, new.branch_id, auth.uid(), 'branch_moved', 'Moved from another branch');
    perform app.audit('enquiry_reassigned', 'enquiry', new.id::text, new.branch_id,
      jsonb_build_object('from_branch', old.branch_id, 'to_branch', new.branch_id));
  end if;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
    if old.status = 'new' and new.first_contacted_at is null and new.status <> 'spam' then
      new.first_contacted_at := now();
    end if;
    insert into public.enquiry_events (enquiry_id, branch_id, user_id, event_type, from_status, to_status)
    values (new.id, new.branch_id, auth.uid(), 'status_changed', old.status, new.status);
  end if;

  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    if not exists (select 1 from public.profiles p
                    where p.id = new.assigned_to and p.is_active
                      and (p.role = 'owner' or p.branch_id = new.branch_id)) then
      raise exception 'An enquiry can only be assigned to an active user of its branch' using errcode = '23514';
    end if;
    insert into public.enquiry_events (enquiry_id, branch_id, user_id, event_type, note)
    values (new.id, new.branch_id, auth.uid(), 'assigned',
      (select full_name from public.profiles where id = new.assigned_to));
  end if;

  -- Fields captured from the visitor are not rewritten by staff.
  new.created_at := old.created_at;
  new.type := old.type;
  new.source_url := old.source_url;
  new.landing_page := old.landing_page;
  new.utm_source := old.utm_source;
  new.utm_medium := old.utm_medium;
  new.utm_campaign := old.utm_campaign;
  new.updated_at := now();
  return new;
end $$;
create trigger enquiries_track_insert after insert on public.enquiries
  for each row execute function app.track_enquiry();
create trigger enquiries_track_update before update on public.enquiries
  for each row execute function app.track_enquiry();

-- ---------------------------------------------------------------------------
-- First-party tracking. No personal data: session_hash is a one-way hash that
-- changes daily and is computed on the server from a secret salt.
-- ---------------------------------------------------------------------------
create table public.site_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type public.site_event_type not null,
  branch_id uuid references public.branches (id) on delete cascade,
  page_path text not null,
  device_type text,
  product_id uuid references public.products (id) on delete set null,
  session_hash text
);
create index site_events_branch_time_idx on public.site_events (branch_id, occurred_at desc);
create index site_events_type_time_idx on public.site_events (event_type, occurred_at desc);

-- Public form rate limiting. key_hash is a salted hash of the client address.
create table public.form_rate_limits (
  id bigint generated always as identity primary key,
  key_hash text not null,
  form text not null,
  created_at timestamptz not null default now()
);
create index form_rate_limits_idx on public.form_rate_limits (key_hash, form, created_at desc);

-- Atomic check-and-record. Returns true when the request is allowed.
create function public.check_rate_limit(p_key_hash text, p_form text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_key_hash || ':' || p_form));
  delete from public.form_rate_limits where created_at < now() - interval '1 day';
  select count(*) into v_count from public.form_rate_limits
   where key_hash = p_key_hash and form = p_form
     and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return false;
  end if;
  insert into public.form_rate_limits (key_hash, form) values (p_key_hash, p_form);
  return true;
end $$;
revoke execute on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.service_prices enable row level security;
alter table public.faqs enable row level security;
alter table public.banners enable row level security;
alter table public.redirects enable row level security;
alter table public.products enable row level security;
alter table public.product_photos enable row level security;
alter table public.enquiries enable row level security;
alter table public.enquiry_events enable row level security;
alter table public.site_events enable row level security;
alter table public.form_rate_limits enable row level security;

create policy services_read on public.services for select to anon, authenticated using (is_active or app.is_owner());
create policy services_owner_write on public.services for all to authenticated using (app.is_owner()) with check (app.is_owner());

create policy service_prices_read on public.service_prices for select to anon, authenticated using (true);
create policy service_prices_owner_write on public.service_prices for all to authenticated using (app.is_owner()) with check (app.is_owner());

create policy faqs_read on public.faqs for select to anon, authenticated using (is_published or app.is_owner());
create policy faqs_owner_write on public.faqs for all to authenticated using (app.is_owner()) with check (app.is_owner());

create policy banners_read on public.banners for select to anon, authenticated using (is_active or app.is_owner());
create policy banners_owner_write on public.banners for all to authenticated using (app.is_owner()) with check (app.is_owner());

create policy redirects_read on public.redirects for select to anon, authenticated using (true);
create policy redirects_owner_write on public.redirects for all to authenticated using (app.is_owner()) with check (app.is_owner());

revoke insert, update, delete on public.services, public.service_prices, public.faqs, public.banners, public.redirects from anon;

-- Products: visitors see Available items only, and never the IMEI column.
create policy products_public_read on public.products for select to anon using (status = 'available');
create policy products_staff_read on public.products for select to authenticated using (app.can_access_branch(branch_id));
create policy products_staff_insert on public.products for insert to authenticated with check (app.can_access_branch(branch_id));
create policy products_staff_update on public.products for update to authenticated
  using (app.can_access_branch(branch_id)) with check (app.can_access_branch(branch_id));
revoke all on public.products from anon;
grant select (id, branch_id, slug, category, brand, model, storage, colour, condition_grade, battery_health_pct,
              price_pence, warranty_months, description, status, created_at)
  on public.products to anon;
revoke delete on public.products from authenticated;

create policy product_photos_public_read on public.product_photos for select to anon
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'available'));
create policy product_photos_staff_all on public.product_photos for all to authenticated
  using (app.can_access_branch(branch_id)) with check (app.can_access_branch(branch_id));
revoke insert, update, delete on public.product_photos from anon;

-- Enquiries: created by the server for visitors; read and updated by the branch.
create policy enquiries_read on public.enquiries for select to authenticated using (app.can_access_branch(branch_id));
create policy enquiries_update on public.enquiries for update to authenticated
  using (app.can_access_branch(branch_id))
  -- The new branch only has to exist; the trigger restricts moving to the Owner.
  with check (app.is_owner() or app.can_access_branch(branch_id));
revoke all on public.enquiries from anon;
revoke insert, delete on public.enquiries from authenticated;

create policy enquiry_events_read on public.enquiry_events for select to authenticated using (app.can_access_branch(branch_id));
create policy enquiry_events_note on public.enquiry_events for insert to authenticated
  with check (app.can_access_branch(branch_id) and event_type = 'note' and user_id = auth.uid()
              and exists (select 1 from public.enquiries e where e.id = enquiry_id and e.branch_id = enquiry_events.branch_id));
revoke all on public.enquiry_events from anon;
revoke update, delete on public.enquiry_events from authenticated;

-- Site events: written by the server (service role); read by the branch or the Owner.
create policy site_events_read on public.site_events for select to authenticated
  using (app.is_owner() or (branch_id is not null and app.can_access_branch(branch_id)));
revoke all on public.site_events from anon;
revoke insert, update, delete on public.site_events from authenticated;

revoke all on public.form_rate_limits from anon, authenticated;
