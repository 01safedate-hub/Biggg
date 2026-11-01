-- Configurable per-category subscription limits, independent of the plan-wide allowance.
alter table public.plans
  add column if not exists category_limits jsonb not null default '{}'::jsonb;

alter table public.plans
  drop constraint if exists plans_category_limits_object;
alter table public.plans
  add constraint plans_category_limits_object
  check (jsonb_typeof(category_limits) = 'object');

create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sp public.subscription_pickups;
  _sub public.subscriptions;
  _plan public.plans;
  _pieces integer;
  _used integer;
  _available integer;
  _total_overage integer;
  _category_overage integer := 0;
  _overage integer;
  _price bigint;
  _line record;
  _category_key text;
  _category_limit integer;
  _category_used integer;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription'
     or new.subscription_pickup_id is null then return new; end if;

  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;

  select coalesce(sum(qty),0)::integer into _pieces
    from public.order_items where order_id = new.id and removed_at is null;

  select coalesce(sum(sp.pieces_counted),0)::integer into _used
    from public.subscription_pickups sp
   where sp.subscription_id = _sub.id and sp.id <> _sp.id
     and sp.scheduled_for >= _sub.current_period_start and sp.scheduled_for < _sub.current_period_end
     and sp.status not in ('missed','skipped');

  _available := greatest(0, _plan.pieces_per_month - _used);
  _total_overage := greatest(0, _pieces - _available);

  -- Category caps are optional. Empty limits preserve the previous plan-only calculation.
  -- A category overage is the sum of pieces beyond each configured category cap for this pickup.
  for _line in
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key,
           sum(oi.qty)::integer as qty
      from public.order_items oi
      left join public.items i on i.id = oi.item_id
      left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null
     group by 1
  loop
    _category_key := _line.category_key;
    if _plan.category_limits ? _category_key then
      begin
        _category_limit := greatest(0, (_plan.category_limits ->> _category_key)::integer);
      exception when others then
        raise exception 'invalid_category_limit_for_%', _category_key using errcode = '22023';
      end;
      select coalesce(sum(oi.qty),0)::integer into _category_used
        from public.order_items oi
        left join public.items i on i.id = oi.item_id
        left join public.item_categories ic on ic.id = i.category_id
       where oi.removed_at is null
         and lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) = _category_key
         and oi.order_id in (
           select prior.order_id from public.subscription_pickups prior
            where prior.subscription_id = _sub.id and prior.id <> _sp.id
              and prior.scheduled_for >= _sub.current_period_start
              and prior.scheduled_for < _sub.current_period_end
              and prior.status not in ('missed','skipped')
         );
      _category_overage := _category_overage + greatest(0, _line.qty + _category_used - _category_limit);
    end if;
  end loop;

  -- Do not double-charge the same pieces: charge the larger of overall or category excess.
  _overage := greatest(_total_overage, _category_overage);
  _price := greatest(0, coalesce(_plan.overage_price_kobo,0));

  update public.subscription_pickups
     set pieces_counted = _pieces, overage_pieces = _overage,
         overage_kobo = _overage::bigint * _price, status = 'collected'
   where id = _sp.id;

  if _overage = 0 then
    update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted';
  end if;
  return new;
end
$function$;

drop trigger if exists orders_finalize_subscription_count on public.orders;
create trigger orders_finalize_subscription_count after update of status on public.orders
for each row execute function private.finalize_subscription_pickup_count();

comment on column public.plans.category_limits is
  'Optional JSON object of item category slug to maximum pieces per subscription billing period; omitted keys are uncapped.';
