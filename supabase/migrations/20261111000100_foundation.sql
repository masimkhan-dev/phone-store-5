-- Milestone 1: foundation. Branches, users, roles, settings, audit log and the
-- helper functions every Row Level Security policy in later migrations uses.

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

create type public.user_role as enum ('owner', 'manager', 'staff');
create type public.print_layout as enum ('a4', 'thermal_80mm');
create type public.vat_mode as enum ('not_registered', 'standard', 'margin_scheme');

create function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  -- Town-based URL slug. Must not collide with a static public route.
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug not in ('repairs', 'shop', 'sell-your-phone', 'unlocking', 'reviews', 'faq', 'about',
                     'contact', 'privacy', 'cookies', 'terms', 'login', 'logout', 'admin', 'api',
                     'sitemap.xml', 'robots.txt', 'reset-password', 'forgot-password')
  ),
  -- Invoice number prefix, e.g. ORM.
  code text not null unique check (code ~ '^[A-Z]{2,5}$'),
  name text not null,
  town text not null,
  address_line1 text not null,
  address_line2 text,
  postcode text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  phone text not null,
  whatsapp text,
  email text,
  google_place_id text,
  google_review_url text,
  -- Shown publicly only when verified_at is set (never invented).
  google_rating numeric(2, 1) check (google_rating between 1 and 5),
  google_review_count integer check (google_review_count >= 0),
  google_rating_verified_at timestamptz,
  intro text,
  print_layout public.print_layout not null default 'a4',
  default_warranty_days integer check (default_warranty_days >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger branches_touch before update on public.branches
  for each row execute function app.touch_updated_at();

create table public.branch_hours (
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- ISO weekday: 1 = Monday ... 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  primary key (branch_id, weekday),
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.branch_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  closed_on date not null,
  reason text,
  unique (branch_id, closed_on)
);

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  role public.user_role not null,
  branch_id uuid references public.branches (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The Owner spans all branches; everyone else belongs to exactly one.
  check ((role = 'owner' and branch_id is null) or (role <> 'owner' and branch_id is not null))
);
create index profiles_branch_idx on public.profiles (branch_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Identity helpers. SECURITY DEFINER so policies can read profiles without
-- recursing into the profiles policies. A deactivated user resolves to no role.
-- ---------------------------------------------------------------------------
create function app.user_role() returns public.user_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create function app.user_branch() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select branch_id from public.profiles where id = auth.uid() and is_active
$$;

create function app.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.user_role() = 'owner', false)
$$;

create function app.is_staff_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.user_role() is not null
$$;

-- Any active user of this branch, or the Owner.
create function app.can_access_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.user_role() = 'owner' or app.user_branch() = p_branch, false)
$$;

-- Manager of this branch, or the Owner.
create function app.can_manage_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    app.user_role() = 'owner' or (app.user_role() = 'manager' and app.user_branch() = p_branch),
    false)
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- business_settings: single row
-- ---------------------------------------------------------------------------
create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default '[Business name]',
  legal_name text,
  logo_path text,
  tagline text,
  region text,
  vat_mode public.vat_mode not null default 'not_registered',
  vat_number text,
  -- Basis points. Only used when vat_mode = 'standard'.
  vat_rate_bp integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  prices_include_vat boolean not null default true,
  -- Set true only after the accountant confirms VAT mode and invoice wording.
  vat_confirmed boolean not null default false,
  default_warranty_text text,
  invoice_terms text,
  no_fix_no_fee_text text,
  enquiry_retention_months integer not null default 12 check (enquiry_retention_months > 0),
  ga4_measurement_id text,
  updated_at timestamptz not null default now()
);
insert into public.business_settings (id) values (true);
create trigger business_settings_touch before update on public.business_settings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs: append-only
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  -- Snapshot, so history keeps the name after a user is deactivated or renamed.
  user_name text,
  branch_id uuid references public.branches (id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index audit_logs_at_idx on public.audit_logs (at desc);
create index audit_logs_branch_idx on public.audit_logs (branch_id, at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create function app.audit(p_action text, p_entity text, p_entity_id text, p_branch uuid, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs (user_id, user_name, branch_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    (select full_name from public.profiles where id = auth.uid()),
    p_branch, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;
grant execute on function app.audit(text, text, text, uuid, jsonb) to authenticated, service_role;

create function app.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% on % is not allowed: this record is append-only', tg_op, tg_table_name
    using errcode = 'P0001';
end $$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app.forbid_change();

-- Recorded by the server after a successful sign-in.
create function public.log_login() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if app.user_role() is null then
    raise exception 'Not an active user' using errcode = '42501';
  end if;
  perform app.audit('login', 'profile', auth.uid()::text, app.user_branch());
end $$;

-- Recorded by the server whenever a report is exported.
create function public.log_export(p_report text, p_branch uuid, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if app.user_role() is null then
    raise exception 'Not an active user' using errcode = '42501';
  end if;
  perform app.audit('export', 'report', p_report, p_branch, p_details);
end $$;

-- ---------------------------------------------------------------------------
-- User management. The server creates the auth user with the admin API, then
-- calls these with the acting user's session so the database decides who may.
-- ---------------------------------------------------------------------------
create function public.can_manage_user(p_role public.user_role, p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    app.user_role() = 'owner'
    or (app.user_role() = 'manager' and p_role = 'staff' and p_branch = app.user_branch()),
    false)
$$;

create function public.create_profile(p_id uuid, p_full_name text, p_email text, p_role public.user_role, p_branch uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_user(p_role, p_branch) then
    raise exception 'You are not allowed to create this user' using errcode = '42501';
  end if;
  insert into public.profiles (id, full_name, email, role, branch_id)
  values (p_id, trim(p_full_name), lower(trim(p_email)), p_role, case when p_role = 'owner' then null else p_branch end);
  perform app.audit('user_created', 'profile', p_id::text, p_branch,
    jsonb_build_object('role', p_role, 'email', lower(trim(p_email))));
end $$;

create function public.update_profile(p_id uuid, p_full_name text, p_role public.user_role, p_branch uuid, p_is_active boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.profiles;
begin
  select * into v_old from public.profiles where id = p_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  -- The actor must be allowed to manage both the current and the new assignment.
  if not public.can_manage_user(v_old.role, v_old.branch_id) or not public.can_manage_user(p_role, p_branch) then
    raise exception 'You are not allowed to change this user' using errcode = '42501';
  end if;
  if p_id = auth.uid() and (p_role <> v_old.role or not p_is_active) then
    raise exception 'You cannot change your own role or deactivate yourself' using errcode = '42501';
  end if;
  update public.profiles
     set full_name = trim(p_full_name),
         role = p_role,
         branch_id = case when p_role = 'owner' then null else p_branch end,
         is_active = p_is_active
   where id = p_id;
  perform app.audit('user_updated', 'profile', p_id::text, p_branch, jsonb_build_object(
    'role_from', v_old.role, 'role_to', p_role,
    'branch_from', v_old.branch_id, 'branch_to', p_branch,
    'active_from', v_old.is_active, 'active_to', p_is_active));
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.branch_hours enable row level security;
alter table public.branch_closures enable row level security;
alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Branch details are public website content.
create policy branches_public_read on public.branches for select to anon, authenticated
  using (is_active or app.is_owner());
create policy branches_owner_insert on public.branches for insert to authenticated
  with check (app.is_owner());
create policy branches_update on public.branches for update to authenticated
  using (app.can_manage_branch(id)) with check (app.can_manage_branch(id));

-- A manager edits contact details and hours, not the identifiers invoices and URLs depend on.
create function app.guard_branch_update() returns trigger
language plpgsql as $$
begin
  if app.user_role() = 'manager' and (
       new.slug is distinct from old.slug or new.code is distinct from old.code
       or new.is_active is distinct from old.is_active or new.sort_order is distinct from old.sort_order
       or new.google_rating is distinct from old.google_rating
       or new.google_review_count is distinct from old.google_review_count
       or new.google_rating_verified_at is distinct from old.google_rating_verified_at) then
    raise exception 'Only the Owner can change a branch slug, code, status or verified rating' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger branches_guard before update on public.branches
  for each row execute function app.guard_branch_update();

create policy branch_hours_read on public.branch_hours for select to anon, authenticated using (true);
create policy branch_hours_write on public.branch_hours for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

create policy branch_closures_read on public.branch_closures for select to anon, authenticated using (true);
create policy branch_closures_write on public.branch_closures for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

-- Profiles: read yourself, your branch colleagues, or everyone as Owner. Writes go through the functions above.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_owner() or (branch_id is not null and branch_id = app.user_branch()));
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Settings: public columns only for visitors; the Owner edits.
create policy business_settings_read on public.business_settings for select to anon, authenticated using (true);
create policy business_settings_owner_update on public.business_settings for update to authenticated
  using (app.is_owner()) with check (app.is_owner());
revoke all on public.business_settings from anon;
grant select (id, business_name, logo_path, tagline, region, no_fix_no_fee_text, default_warranty_text, ga4_measurement_id)
  on public.business_settings to anon;
revoke insert, delete on public.business_settings from authenticated;

create policy audit_logs_owner_read on public.audit_logs for select to authenticated using (app.is_owner());
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke select on public.audit_logs from anon;

revoke insert, update, delete on public.branches, public.branch_hours, public.branch_closures from anon;
