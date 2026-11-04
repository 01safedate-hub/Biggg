-- Enforce the subscription pickup policy at the database boundary.
-- Two active pickup opportunities are allowed per billing period, with at least
-- 14 days between scheduled dates. Missed/skipped records do not block a replacement.
create or replace function private.enforce_subscription_pickup_spacing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _sub public.subscriptions;
  _active_count integer;
begin
  select * into _sub
    from public.subscriptions
   where id = new.subscription_id
   for update;

  if not found or _sub.status <> 'active' then
    raise exception 'subscription_not_active' using errcode = 'P0001';
  end if;

  if _sub.current_period_start is null or _sub.current_period_end is null
     or new.scheduled_for < _sub.current_period_start
     or new.scheduled_for >= _sub.current_period_end then
    raise exception 'pickup_outside_subscription_period' using errcode = 'P0001';
  end if;

  select count(*) into _active_count
    from public.subscription_pickups sp
   where sp.subscription_id = new.subscription_id
     and sp.scheduled_for >= _sub.current_period_start
     and sp.scheduled_for < _sub.current_period_end
     and sp.status not in ('missed', 'skipped')
     and sp.id is distinct from new.id;

  if tg_op = 'INSERT' and _active_count >= 2 then
    raise exception 'monthly_pickup_limit_reached' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.subscription_pickups sp
     where sp.subscription_id = new.subscription_id
       and sp.scheduled_for >= _sub.current_period_start
       and sp.scheduled_for < _sub.current_period_end
       and sp.status not in ('missed', 'skipped')
       and sp.id is distinct from new.id
       and abs(extract(epoch from (new.scheduled_for - sp.scheduled_for))) < 14 * 24 * 60 * 60
  ) then
    raise exception 'subscription_pickups_must_be_14_days_apart' using errcode = 'P0001';
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_subscription_pickup_spacing() from public, anon, authenticated;

drop trigger if exists subscription_pickups_enforce_spacing on public.subscription_pickups;
create trigger subscription_pickups_enforce_spacing
  before insert or update of subscription_id, scheduled_for
  on public.subscription_pickups
  for each row execute function private.enforce_subscription_pickup_spacing();

comment on function private.enforce_subscription_pickup_spacing() is
  'Enforces at most two non-skipped subscription pickups per billing period and a minimum 14-day gap.';
