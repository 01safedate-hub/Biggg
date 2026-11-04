-- Enforce monthly-cycle allowance and per-pickup included-piece limits for multi-month subscriptions.
create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sp public.subscription_pickups; _sub public.subscriptions; _plan public.plans;
  _pieces integer; _used integer; _available integer; _total_overage integer;
  _excluded_pieces integer := 0; _category_overage integer := 0; _included_pieces integer := 0;
  _overage integer; _price bigint; _line record; _category_key text;
  _category_limit integer; _category_used integer;
  _cycle_start timestamptz; _cycle_end timestamptz; _cycle_months integer;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription' or new.subscription_pickup_id is null then return new; end if;
  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;
  _cycle_months := greatest(0, (extract(year from age(_sp.scheduled_for, _sub.current_period_start))::integer * 12)
                                + extract(month from age(_sp.scheduled_for, _sub.current_period_start))::integer);
  _cycle_start := _sub.current_period_start + make_interval(months => _cycle_months);
  _cycle_end := _sub.current_period_start + make_interval(months => _cycle_months + 1);
  select coalesce(sum(qty),0)::integer into _pieces from public.order_items where order_id = new.id and removed_at is null;
  select coalesce(sum(greatest(coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0), 0)), 0)::integer
    into _used
    from public.subscription_pickups prior
   where prior.subscription_id = _sub.id and prior.id <> _sp.id
     and prior.scheduled_for >= _cycle_start and prior.scheduled_for < _cycle_end
     and prior.status not in ('missed','skipped');
  _available := greatest(0, least(_plan.pieces_per_month - _used, coalesce(_plan.weekly_allowance, _plan.pieces_per_month)));
  for _line in
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key, sum(oi.qty)::integer as qty
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  loop
    _category_key := _line.category_key;
    if _plan.category_limits ? _category_key then
      begin _category_limit := greatest(0, (_plan.category_limits ->> _category_key)::integer);
      exception when others then raise exception 'invalid_category_limit_for_%', _category_key using errcode = '22023'; end;
      select coalesce(sum(oi.qty),0)::integer into _category_used
        from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
       where oi.removed_at is null and lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) = _category_key
         and oi.order_id in (select prior_order.id from public.subscription_pickups prior join public.orders prior_order on prior_order.subscription_pickup_id = prior.id
          where prior.subscription_id = _sub.id and prior.id <> _sp.id and prior.scheduled_for >= _cycle_start
            and prior.scheduled_for < _cycle_end and prior.status not in ('missed','skipped'));
      if _category_limit = 0 then null;
      else _category_overage := _category_overage + greatest(0, _line.qty + _category_used - _category_limit);
           _included_pieces := _included_pieces + least(_line.qty, greatest(0, _category_limit - _category_used)); end if;
    else _included_pieces := _included_pieces + _line.qty; end if;
  end loop;
  select coalesce(sum(excluded_line.qty), 0)::integer into _excluded_pieces from (
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key, sum(oi.qty)::integer as qty
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  ) excluded_line where _plan.category_limits ? excluded_line.category_key and coalesce((_plan.category_limits ->> excluded_line.category_key)::integer, 0) = 0;
  _total_overage := greatest(0, _included_pieces - _available);
  _overage := _excluded_pieces + _category_overage + _total_overage;
  _price := greatest(0, coalesce(_plan.overage_price_kobo,0));
  update public.subscription_pickups set pieces_counted = _pieces, overage_pieces = _overage, overage_kobo = _overage::bigint * _price, status = 'collected' where id = _sp.id;
  if _overage = 0 then update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted'; end if;
  return new;
end
$function$;

create or replace function private.enforce_subscription_pickup_spacing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _sub public.subscriptions;
  _active_count integer;
  _cycle_months integer;
  _cycle_start timestamptz;
  _cycle_end timestamptz;
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

  _cycle_months := greatest(0, (extract(year from age(new.scheduled_for, _sub.current_period_start))::integer * 12)
                                + extract(month from age(new.scheduled_for, _sub.current_period_start))::integer);
  _cycle_start := _sub.current_period_start + make_interval(months => _cycle_months);
  _cycle_end := _sub.current_period_start + make_interval(months => _cycle_months + 1);

  select count(*) into _active_count
    from public.subscription_pickups sp
   where sp.subscription_id = new.subscription_id
     and sp.scheduled_for >= _cycle_start
     and sp.scheduled_for < _cycle_end
     and sp.status not in ('missed', 'skipped')
     and sp.id is distinct from new.id;

  if _active_count >= 2 then
    raise exception 'monthly_pickup_limit_reached' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.subscription_pickups sp
     where sp.subscription_id = new.subscription_id
       and sp.scheduled_for >= _cycle_start
       and sp.scheduled_for < _cycle_end
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

comment on function private.finalize_subscription_pickup_count() is
  'Bills excluded/category-capped pieces and any eligible pieces above the monthly cycle allowance or per-pickup included-piece limit.';
