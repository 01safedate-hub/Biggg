-- Foundational tables for leave balances, public holidays, roster blackouts and shift swaps.
create table if not exists public.leave_types (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 paid boolean not null default false,
 annual_allowance_days numeric(6,2) not null default 0 check (annual_allowance_days >= 0),
 requires_approval boolean not null default true,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.leave_balances (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.profiles(id) on delete cascade,
 leave_type_id uuid not null references public.leave_types(id) on delete cascade,
 year integer not null,
 allowance_days numeric(6,2) not null default 0 check (allowance_days >= 0),
 adjustment_days numeric(6,2) not null default 0,
 updated_at timestamptz not null default now(),
 unique(staff_id, leave_type_id, year)
);
alter table public.leave_requests add column if not exists leave_type_id uuid references public.leave_types(id);
alter table public.leave_requests add column if not exists days_requested numeric(6,2);
alter table public.leave_requests add column if not exists cancelled_at timestamptz;
alter table public.leave_requests add column if not exists cancellation_note text;
create table if not exists public.public_holidays (
 id uuid primary key default gen_random_uuid(),
 holiday_date date not null unique,
 name text not null,
 grants_day_in_lieu boolean not null default false,
 active boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.roster_blackouts (
 id uuid primary key default gen_random_uuid(),
 blackout_date date not null,
 zone_id uuid references public.zones(id) on delete cascade,
 reason text not null,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(blackout_date, zone_id)
);
create table if not exists public.shift_swaps (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null references public.shifts(id) on delete cascade,
 requester_id uuid not null references public.profiles(id) on delete cascade,
 target_staff_id uuid references public.profiles(id) on delete set null,
 target_shift_id uuid references public.shifts(id) on delete set null,
 reason text,
 status text not null default 'pending' check (status in ('pending','accepted','approved','rejected','cancelled')),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 decision_note text,
 created_at timestamptz not null default now(),
 check (target_staff_id is null or target_staff_id <> requester_id)
);
create index if not exists leave_requests_staff_dates_idx on public.leave_requests(staff_id,start_date,end_date);
create index if not exists shift_swaps_status_created_idx on public.shift_swaps(status,created_at);
create index if not exists roster_blackouts_date_idx on public.roster_blackouts(blackout_date);
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.public_holidays enable row level security;
alter table public.roster_blackouts enable row level security;
alter table public.shift_swaps enable row level security;
drop policy if exists "active leave types visible to signed in staff" on public.leave_types;
create policy "active leave types visible to signed in staff" on public.leave_types for select to authenticated using (active or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')));
drop policy if exists "staff view own leave balance or managers view all" on public.leave_balances;
create policy "staff view own leave balance or managers view all" on public.leave_balances for select to authenticated using (staff_id=auth.uid() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')));
drop policy if exists "holidays visible to signed in staff" on public.public_holidays;
create policy "holidays visible to signed in staff" on public.public_holidays for select to authenticated using (true);
drop policy if exists "blackouts visible to roster managers" on public.roster_blackouts;
create policy "blackouts visible to roster managers" on public.roster_blackouts for select to authenticated using (exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')));
drop policy if exists "staff view own swaps or managers view all" on public.shift_swaps;
create policy "staff view own swaps or managers view all" on public.shift_swaps for select to authenticated using (requester_id=auth.uid() or target_staff_id=auth.uid() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')));
