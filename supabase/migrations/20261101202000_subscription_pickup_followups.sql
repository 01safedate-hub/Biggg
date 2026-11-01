-- Planned subscription pickup follow-ups are separate from booked pickups.
-- They must not consume the two-pickup allowance until an actual order is booked.
create table if not exists public.subscription_pickup_followups (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  first_pickup_id uuid not null references public.subscription_pickups(id) on delete cascade,
  scheduled_for timestamptz not null,
  call_status text not null default 'pending' check (call_status in ('pending','confirmed','rescheduled','skipped')),
  call_notes text,
  last_called_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(first_pickup_id)
);
create index if not exists subscription_pickup_followups_due_idx
  on public.subscription_pickup_followups (scheduled_for, call_status)
  where call_status in ('pending','rescheduled');
alter table public.subscription_pickup_followups enable row level security;
drop policy if exists subscription_pickup_followups_customer_read on public.subscription_pickup_followups;
create policy subscription_pickup_followups_customer_read
  on public.subscription_pickup_followups for select to authenticated
  using (customer_id = (select auth.uid()));
drop policy if exists subscription_pickup_followups_staff_read on public.subscription_pickup_followups;
create policy subscription_pickup_followups_staff_read
  on public.subscription_pickup_followups for select to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%admin%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%secretary%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%cashier%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%super_admin%');
drop policy if exists subscription_pickup_followups_staff_update on public.subscription_pickup_followups;
create policy subscription_pickup_followups_staff_update
  on public.subscription_pickup_followups for update to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%admin%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%secretary%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%cashier%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%super_admin%')
  with check (coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%admin%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%secretary%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%cashier%'
      or coalesce((select auth.jwt()->'app_metadata'->'roles')::text,'') like '%super_admin%');

-- When a real subscription pickup is collected, create a separate reminder for
-- 14 days later only when it falls inside the subscription period. This row is
-- a call reminder, not a booked pickup and does not count against pickup limits.
create or replace function public.create_subscription_pickup_followup()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sub public.subscriptions;
  _next timestamptz;
begin
  if new.status <> 'collected' or old.status is not distinct from new.status then
    return new;
  end if;
  select * into _sub from public.subscriptions where id = new.subscription_id;
  if not found or _sub.status <> 'active' then return new; end if;
  _next := new.scheduled_for + interval '14 days';
  if _next <= now() then _next := now() + interval '1 day'; end if;
  if _next >= _sub.current_period_end then return new; end if;
  insert into public.subscription_pickup_followups
    (subscription_id, customer_id, first_pickup_id, scheduled_for)
  values (_sub.id, _sub.customer_id, new.id, _next)
  on conflict (first_pickup_id) do nothing;
  return new;
end
$function$;
drop trigger if exists subscription_pickup_create_followup on public.subscription_pickups;
create trigger subscription_pickup_create_followup
  after update of status on public.subscription_pickups
  for each row execute function public.create_subscription_pickup_followup();
