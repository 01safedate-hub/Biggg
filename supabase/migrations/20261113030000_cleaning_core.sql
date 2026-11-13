-- Cleaning service: tables, settings, rate card, photo storage.
-- Every job is quoted from an admin rate card, accepted and prepaid online or at the desk,
-- then delivered as visits with codes, checklists and photos. Monthly plans generate their
-- own visits inside the paid term only.

-- ---------- Settings ----------
insert into public.settings (key, value) values ('cleaning', jsonb_build_object(
  'admin_email', 'nnebedum50@gmail.com',
  'hotline', '09132584627',
  'whatsapp', '2349132584627',
  'inspection_fee_bands', jsonb_build_array(
     jsonb_build_object('max_km', 5, 'fee_kobo', 300000),
     jsonb_build_object('max_km', 10, 'fee_kobo', 500000),
     jsonb_build_object('max_km', 999, 'fee_kobo', 700000)),
  'quote_valid_days', 7,
  'inspector_limit_kobo', 5000000,
  'override_floor_pct', 15,
  'min_job_kobo', 800000,
  'deposit_threshold_kobo', 10000000,
  'deposit_pct', 50,
  'travel_buffer_min', 30,
  'daily_cap_min', 420,
  'max_minutes_per_cleaner', 240,
  'fallback_daily_crew_minutes', 840,
  'fallback_cleaners', 2,
  'reschedule_cutoff_hours', 24,
  'complaint_window_hours', 24,
  'credit_valid_days', 60,
  'renewal_grace_days', 3,
  'damage_cap_kobo', 5000000,
  'bundle_discount_pct', 10,
  'hold_minutes', 30,
  'plan_horizon_days', 42,
  'term_discounts', jsonb_build_object('monthly', 0, 'three_month', 2, 'six_month', 5, 'yearly', 10),
  'crew_hour_rate_kobo', 100000,
  'crew_min_visit_kobo', 200000,
  'five_star_bonus_kobo', 50000,
  'inspection_pay_kobo', 100000,
  'inspection_accept_bonus_kobo', 100000
)) on conflict (key) do nothing;

-- ---------- Rate card (versioned; every quote stores the version it used) ----------
create table if not exists public.cleaning_rate_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  data jsonb not null,
  active boolean not null default false,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists cleaning_rate_one_active on public.cleaning_rate_versions (active) where active;

insert into public.cleaning_rate_versions (version, active, note, data)
select 1, true, 'Starting rate card', jsonb_build_object(
  'spaces', jsonb_build_object(
    'bedroom',      jsonb_build_object('label', 'Bedroom', 'price_kobo', 250000, 'minutes', 30),
    'living_room',  jsonb_build_object('label', 'Living room', 'price_kobo', 300000, 'minutes', 40),
    'kitchen',      jsonb_build_object('label', 'Kitchen', 'price_kobo', 300000, 'minutes', 45),
    'bathroom',     jsonb_build_object('label', 'Toilet and bathroom', 'price_kobo', 200000, 'minutes', 30),
    'dining',       jsonb_build_object('label', 'Dining area', 'price_kobo', 150000, 'minutes', 20),
    'store',        jsonb_build_object('label', 'Store room', 'price_kobo', 100000, 'minutes', 15),
    'balcony',      jsonb_build_object('label', 'Balcony or veranda', 'price_kobo', 100000, 'minutes', 15),
    'corridor',     jsonb_build_object('label', 'Corridor or stairs', 'price_kobo', 100000, 'minutes', 15),
    'office_small', jsonb_build_object('label', 'Office room (small)', 'price_kobo', 250000, 'minutes', 30),
    'office_large', jsonb_build_object('label', 'Office hall (large)', 'price_kobo', 600000, 'minutes', 75)),
  'services', jsonb_build_object(
    'standard',          jsonb_build_object('label', 'Standard clean', 'multiplier', 1.0),
    'deep',              jsonb_build_object('label', 'Deep clean', 'multiplier', 1.7),
    'move',              jsonb_build_object('label', 'Move-in or move-out clean', 'multiplier', 1.8),
    'post_construction', jsonb_build_object('label', 'Post-construction clean', 'multiplier', 2.5),
    'after_event',       jsonb_build_object('label', 'After-event clean', 'multiplier', 1.3),
    'shortlet',          jsonb_build_object('label', 'Shortlet turnover', 'multiplier', 1.1),
    'office',            jsonb_build_object('label', 'Office clean', 'multiplier', 1.0)),
  'conditions', jsonb_build_object(
    'light',  jsonb_build_object('label', 'Light', 'multiplier', 1.0),
    'normal', jsonb_build_object('label', 'Normal', 'multiplier', 1.15),
    'heavy',  jsonb_build_object('label', 'Heavy', 'multiplier', 1.4)),
  'addons', jsonb_build_object(
    'fridge',          jsonb_build_object('label', 'Inside fridge', 'price_kobo', 300000, 'minutes', 30),
    'oven',            jsonb_build_object('label', 'Inside oven', 'price_kobo', 300000, 'minutes', 30),
    'windows_outside', jsonb_build_object('label', 'Outside windows (ground floor)', 'price_kobo', 100000, 'minutes', 10),
    'sofa_seat',       jsonb_build_object('label', 'Sofa cleaning (per seat)', 'price_kobo', 150000, 'minutes', 15),
    'mattress',        jsonb_build_object('label', 'Mattress cleaning', 'price_kobo', 400000, 'minutes', 30),
    'compound',        jsonb_build_object('label', 'Compound sweeping', 'price_kobo', 300000, 'minutes', 30),
    'extra_hour',      jsonb_build_object('label', 'Extra crew hour', 'price_kobo', 250000, 'minutes', 60)),
  'round_to_kobo', 5000)
where not exists (select 1 from public.cleaning_rate_versions);

-- ---------- Plan types ----------
create table if not exists public.cleaning_plan_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  blurb text,
  visits_per_month integer not null check (visits_per_month between 1 and 31),
  deep_every_months integer check (deep_every_months is null or deep_every_months between 2 and 12),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 60),
  custom boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.cleaning_plan_types (slug, name, blurb, visits_per_month, deep_every_months, discount_pct, custom, sort_order) values
  ('care_2', 'Care 2', 'Two standard cleans a month, every other week.', 2, null, 10, false, 1),
  ('care_4', 'Care 4', 'A standard clean every week.', 4, null, 15, false, 2),
  ('care_4_plus', 'Care 4+', 'A clean every week, with a deep clean every third month.', 4, 3, 15, false, 3),
  ('custom', 'Custom', 'Any number of visits, priced for your home or business.', 4, null, 0, true, 4)
on conflict (slug) do nothing;

-- ---------- Properties ----------
create table if not exists public.cleaning_properties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  kind text not null default 'flat' check (kind in ('self_contain', 'flat', 'duplex', 'bungalow', 'shortlet', 'hostel', 'office', 'shop', 'other')),
  address text not null check (length(trim(address)) between 5 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  zone_id uuid references public.zones(id) on delete set null,
  distance_km numeric,
  bedrooms integer check (bedrooms between 0 and 30),
  bathrooms integer check (bathrooms between 0 and 30),
  water_note text, power_note text, access_note text,
  keys_allowed boolean not null default false,
  key_holder text, pets text, estate_name text, gate_contact text, people_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);
create index if not exists cleaning_properties_customer on public.cleaning_properties (customer_id);

-- ---------- Requests ----------
create sequence if not exists public.cleaning_request_no_seq;
create table if not exists public.cleaning_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint not null default nextval('public.cleaning_request_no_seq') unique,
  customer_id uuid references public.profiles(id) on delete set null,
  contact_name text, contact_phone text,
  source text not null default 'web' check (source in ('web', 'whatsapp', 'call', 'walk_in')),
  service text not null check (service in ('standard', 'deep', 'move', 'post_construction', 'after_event', 'shortlet', 'office')),
  wants_plan boolean not null default false,
  property_id uuid references public.cleaning_properties(id) on delete set null,
  address text, lat double precision, lng double precision, zone_id uuid references public.zones(id) on delete set null,
  distance_km numeric,
  home_kind text, bedrooms integer, bathrooms integer,
  details text check (details is null or length(details) <= 1000),
  preferred text check (preferred is null or length(preferred) <= 200),
  photos text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'contacted', 'inspection_booked', 'quoting', 'quoted', 'accepted', 'lost', 'cancelled')),
  lost_reason text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is not null or (contact_name is not null and contact_phone is not null))
);
create index if not exists cleaning_requests_status on public.cleaning_requests (status, created_at desc);
create index if not exists cleaning_requests_customer on public.cleaning_requests (customer_id);

-- ---------- Inspections ----------
create table if not exists public.cleaning_inspections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.cleaning_requests(id) on delete cascade,
  inspector_id uuid references public.profiles(id) on delete set null,
  mode text not null default 'onsite' check (mode in ('onsite', 'remote')),
  scheduled_for timestamptz,
  duration_min integer not null default 45,
  fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  fee_waived boolean not null default false,
  waived_by uuid references public.profiles(id) on delete set null,
  waive_reason text,
  fee_paid boolean not null default false,
  status text not null default 'scheduled' check (status in ('awaiting_fee', 'scheduled', 'done', 'cancelled', 'no_show')),
  findings jsonb not null default '{}'::jsonb,
  photos text[] not null default '{}',
  done_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_inspections_day on public.cleaning_inspections (scheduled_for);

-- ---------- Quotes ----------
create sequence if not exists public.cleaning_quote_no_seq;
create table if not exists public.cleaning_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no bigint not null default nextval('public.cleaning_quote_no_seq') unique,
  request_id uuid references public.cleaning_requests(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.cleaning_properties(id) on delete restrict,
  version integer not null default 1,
  kind text not null check (kind in ('one_off', 'plan')),
  service text not null,
  condition text not null default 'normal',
  spaces jsonb not null default '{}'::jsonb,
  addons jsonb not null default '{}'::jsonb,
  rate_version_id uuid references public.cleaning_rate_versions(id) on delete set null,
  lines jsonb not null default '[]'::jsonb,
  subtotal_kobo bigint not null default 0,
  transport_kobo bigint not null default 0,
  transport_waived_kobo bigint not null default 0,
  override_kobo bigint check (override_kobo is null or override_kobo > 0),
  override_reason text,
  visit_price_kobo bigint not null default 0,
  crew_size integer not null default 1 check (crew_size between 1 and 10),
  duration_min integer not null default 60 check (duration_min between 15 and 960),
  plan_type_id uuid references public.cleaning_plan_types(id) on delete set null,
  visits_per_month integer,
  plan_discount_pct numeric(5,2),
  bundle boolean not null default false,
  monthly_kobo bigint,
  first_deep_kobo bigint,
  deep_duration_min integer,
  inspection_credit_kobo bigint not null default 0,
  exclusions text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  valid_until timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz, accepted_at timestamptz, declined_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_quotes_customer on public.cleaning_quotes (customer_id, created_at desc);
create index if not exists cleaning_quotes_request on public.cleaning_quotes (request_id);

-- ---------- Subscriptions ----------
create table if not exists public.cleaning_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.cleaning_properties(id) on delete restrict,
  quote_id uuid references public.cleaning_quotes(id) on delete set null,
  plan_type_id uuid references public.cleaning_plan_types(id) on delete set null,
  service text not null default 'standard',
  monthly_kobo bigint not null check (monthly_kobo > 0),
  visits_per_month integer not null check (visits_per_month between 1 and 31),
  deep_every_months integer,
  crew_size integer not null default 1,
  duration_min integer not null default 60,
  deep_duration_min integer,
  weekday integer not null check (weekday between 1 and 6),
  time_window text not null default 'morning' check (time_window in ('morning', 'afternoon')),
  term text not null default 'monthly' check (term in ('monthly', 'three_month', 'six_month', 'yearly')),
  start_date date not null,
  current_period_start date,
  current_period_end date,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'past_due', 'paused', 'cancelled', 'ended')),
  cancel_at_period_end boolean not null default false,
  paused_from date, paused_until date, pauses_used_days integer not null default 0,
  bundle boolean not null default false,
  bundle_waiver_id uuid references public.transport_waivers(id) on delete set null,
  preferred_lead_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_subs_customer on public.cleaning_subscriptions (customer_id);

-- ---------- Invoices (what customers pay) ----------
create table if not exists public.cleaning_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('inspection', 'quote', 'balance', 'renewal', 'extra_work')),
  inspection_id uuid references public.cleaning_inspections(id) on delete set null,
  quote_id uuid references public.cleaning_quotes(id) on delete set null,
  subscription_id uuid references public.cleaning_subscriptions(id) on delete set null,
  visit_id uuid,
  extra_id uuid,
  amount_kobo bigint not null check (amount_kobo > 0),
  description text not null,
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  period_start date, period_end date,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists cleaning_invoices_customer on public.cleaning_invoices (customer_id, status);

alter table public.payments add column if not exists cleaning_invoice_id uuid references public.cleaning_invoices(id) on delete set null;
alter table public.payments drop constraint if exists payments_purpose_check;
alter table public.payments add constraint payments_purpose_check check (purpose = any (array['pickup_fare','delivery_fare','items','subscription','extra_clothes','demurrage','other','custom_deposit','cleaning']));

-- ---------- Visits ----------
create sequence if not exists public.cleaning_visit_no_seq;
create table if not exists public.cleaning_visits (
  id uuid primary key default gen_random_uuid(),
  visit_no bigint not null default nextval('public.cleaning_visit_no_seq') unique,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.cleaning_properties(id) on delete restrict,
  quote_id uuid references public.cleaning_quotes(id) on delete set null,
  subscription_id uuid references public.cleaning_subscriptions(id) on delete set null,
  kind text not null default 'one_off' check (kind in ('one_off', 'plan', 'plan_first', 'reclean', 'credit')),
  service text not null default 'standard',
  scheduled_date date not null,
  time_window text not null default 'morning' check (time_window in ('morning', 'afternoon')),
  start_time time,
  crew_size integer not null default 1 check (crew_size between 1 and 10),
  duration_min integer not null default 60 check (duration_min between 15 and 960),
  zone_id uuid references public.zones(id) on delete set null,
  status text not null default 'scheduled' check (status in ('held', 'scheduled', 'on_the_way', 'in_progress', 'awaiting_signoff', 'done', 'no_show', 'cancelled', 'unsafe')),
  hold_until timestamptz,
  arrival_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  completion_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  code_attempts integer not null default 0,
  checklist jsonb not null default '[]'::jsonb,
  before_photos text[] not null default '{}',
  after_photos text[] not null default '{}',
  bundle_laundry boolean not null default false,
  started_at timestamptz, finished_at timestamptz,
  signoff text check (signoff is null or signoff in ('code', 'timeout', 'staff')),
  signed_off_at timestamptz,
  rating integer check (rating between 1 and 5), rating_note text,
  counts_as_used boolean not null default true,
  cancelled_reason text, cancelled_by_us boolean,
  balance_due_kobo bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_visits_day on public.cleaning_visits (scheduled_date, status);
create index if not exists cleaning_visits_customer on public.cleaning_visits (customer_id, scheduled_date desc);
create index if not exists cleaning_visits_sub on public.cleaning_visits (subscription_id, scheduled_date);

create table if not exists public.cleaning_visit_crew (
  visit_id uuid not null references public.cleaning_visits(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'cleaner' check (role in ('lead', 'cleaner')),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (visit_id, staff_id)
);
create unique index if not exists cleaning_visit_one_lead on public.cleaning_visit_crew (visit_id) where role = 'lead';
create index if not exists cleaning_visit_crew_staff on public.cleaning_visit_crew (staff_id);

alter table public.cleaning_invoices drop constraint if exists cleaning_invoices_visit_fk;
alter table public.cleaning_invoices add constraint cleaning_invoices_visit_fk foreign key (visit_id) references public.cleaning_visits(id) on delete set null;

-- ---------- Extra work, credits, issues, zone days, events ----------
create table if not exists public.cleaning_extras (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.cleaning_visits(id) on delete cascade,
  lines jsonb not null default '[]'::jsonb,
  amount_kobo bigint not null check (amount_kobo > 0),
  minutes integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  invoice_id uuid references public.cleaning_invoices(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.cleaning_invoices drop constraint if exists cleaning_invoices_extra_fk;
alter table public.cleaning_invoices add constraint cleaning_invoices_extra_fk foreign key (extra_id) references public.cleaning_extras(id) on delete set null;

create table if not exists public.cleaning_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.cleaning_subscriptions(id) on delete cascade,
  source_visit_id uuid references public.cleaning_visits(id) on delete set null,
  used_visit_id uuid references public.cleaning_visits(id) on delete set null,
  reason text not null,
  expires_on date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cleaning_issues (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.cleaning_visits(id) on delete cascade,
  kind text not null check (kind in ('complaint', 'damage', 'unsafe', 'other')),
  description text not null check (length(trim(description)) between 3 and 2000),
  photos text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'reclean_booked', 'resolved', 'rejected')),
  raised_by uuid references public.profiles(id) on delete set null,
  outcome text,
  payout_kobo bigint not null default 0 check (payout_kobo >= 0),
  reclean_visit_id uuid references public.cleaning_visits(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.cleaning_zone_days (
  zone_id uuid not null references public.zones(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 6),
  primary key (zone_id, weekday)
);

create table if not exists public.cleaning_events (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_events_entity on public.cleaning_events (entity, entity_id, created_at);

-- Everything is read and written through SECURITY DEFINER functions; no direct table access.
alter table public.cleaning_rate_versions enable row level security;
alter table public.cleaning_plan_types enable row level security;
alter table public.cleaning_properties enable row level security;
alter table public.cleaning_requests enable row level security;
alter table public.cleaning_inspections enable row level security;
alter table public.cleaning_quotes enable row level security;
alter table public.cleaning_subscriptions enable row level security;
alter table public.cleaning_invoices enable row level security;
alter table public.cleaning_visits enable row level security;
alter table public.cleaning_visit_crew enable row level security;
alter table public.cleaning_extras enable row level security;
alter table public.cleaning_credits enable row level security;
alter table public.cleaning_issues enable row level security;
alter table public.cleaning_zone_days enable row level security;
alter table public.cleaning_events enable row level security;
drop policy if exists cleaning_plan_types_read on public.cleaning_plan_types;
create policy cleaning_plan_types_read on public.cleaning_plan_types for select to anon, authenticated using (active);

-- ---------- Who works on cleaning ----------
create or replace function private.is_cleaning_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid()
    and role::text in ('inspector', 'cleaning_lead', 'cleaner', 'scheduler', 'secretary', 'cashier', 'admin', 'super_admin'))
$$;
-- Takes requests, books inspections, records desk payments.
create or replace function private.is_cleaning_desk()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid()
    and role::text in ('scheduler', 'secretary', 'cashier', 'admin', 'super_admin'))
$$;
-- Assigns crews, moves visits, resolves issues.
create or replace function private.is_cleaning_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid()
    and role::text in ('scheduler', 'admin', 'super_admin'))
$$;
revoke all on function private.is_cleaning_staff() from public, anon;
revoke all on function private.is_cleaning_desk() from public, anon;
revoke all on function private.is_cleaning_manager() from public, anon;
grant execute on function private.is_cleaning_staff() to authenticated;
grant execute on function private.is_cleaning_desk() to authenticated;
grant execute on function private.is_cleaning_manager() to authenticated;

-- ---------- Photo storage ----------
-- Paths: <kind>/<customer id>/<entity id>/<file>. Customers read their own; staff read and write all;
-- customers may upload only request photos into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cleaning-photos', 'cleaning-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
drop policy if exists cleaning_photos_read on storage.objects;
create policy cleaning_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'cleaning-photos' and ((select private.is_cleaning_staff()) or (storage.foldername(name))[2] = (select auth.uid())::text));
drop policy if exists cleaning_photos_insert on storage.objects;
create policy cleaning_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cleaning-photos' and ((select private.is_cleaning_staff())
    or ((storage.foldername(name))[1] = 'requests' and (storage.foldername(name))[2] = (select auth.uid())::text)));
