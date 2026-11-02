-- Give pickup agents the minimum subscription plan data needed for their assigned pickup.
-- Do not expose subscriptions or customer billing data directly through RLS.
create or replace function public.agent_subscription_plan_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _order public.orders;
  _pickup public.subscription_pickups;
  _sub public.subscriptions;
  _plan public.plans;
  _used integer := 0;
  _category_used jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into _order
    from public.orders
   where id = p_order_id
     and source = 'subscription'
     and (pickup_agent_id = auth.uid() or delivery_agent_id = auth.uid());
  if not found then
    raise exception 'order_not_assigned_to_agent' using errcode = '42501';
  end if;
  if _order.subscription_pickup_id is null then
    raise exception 'subscription_pickup_missing' using errcode = 'P0001';
  end if;

  select * into _pickup from public.subscription_pickups where id = _order.subscription_pickup_id;
  if not found then raise exception 'subscription_pickup_missing' using errcode = 'P0001'; end if;
  select * into _sub from public.subscriptions where id = _pickup.subscription_id;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;

  select coalesce(sum(case
      when coalesce((_plan.category_limits ->> usage.category_key)::integer, -1) = 0 then 0
      when coalesce((_plan.category_limits ->> usage.category_key)::integer, -1) > 0 then least(usage.pieces, (_plan.category_limits ->> usage.category_key)::integer)
      else usage.pieces end), 0)::integer into _used
    from (select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key,
                 sum(oi.qty)::integer as pieces
            from public.subscription_pickups sp join public.orders o on o.subscription_pickup_id = sp.id
            join public.order_items oi on oi.order_id = o.id and oi.removed_at is null
            left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
           where sp.subscription_id = _sub.id and sp.id <> _pickup.id
             and sp.scheduled_for >= _sub.current_period_start and sp.scheduled_for < _sub.current_period_end
             and sp.status not in ('missed','skipped') group by 1) usage;

  select coalesce(jsonb_object_agg(category_key, pieces), '{}'::jsonb)
    into _category_used
    from (
      select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'),
                                  '[^a-z0-9]+', '-', 'g')) as category_key,
             sum(oi.qty)::integer as pieces
        from public.subscription_pickups sp
        join public.orders o on o.subscription_pickup_id = sp.id
        join public.order_items oi on oi.order_id = o.id and oi.removed_at is null
        left join public.items i on i.id = oi.item_id
        left join public.item_categories ic on ic.id = i.category_id
       where sp.subscription_id = _sub.id
         and sp.id <> _pickup.id
         and sp.scheduled_for >= _sub.current_period_start
         and sp.scheduled_for < _sub.current_period_end
         and sp.status not in ('missed','skipped')
       group by 1
    ) counts;

  return jsonb_build_object(
    'plan_id', _plan.id,
    'plan_name', _plan.name,
    'pieces_per_month', _plan.pieces_per_month,
    'category_limits', coalesce(_plan.category_limits, '{}'::jsonb),
    'period_pieces_used', _used,
    'category_pieces_used', _category_used,
    'period_pieces_remaining', greatest(0, _plan.pieces_per_month - _used)
  );
end
$function$;

revoke all on function public.agent_subscription_plan_for_order(uuid) from public, anon;
grant execute on function public.agent_subscription_plan_for_order(uuid) to authenticated;

-- The agreed Starter and Pro rule is that categories already excluded on Starter
-- are also excluded on Pro. Preserve any explicit Pro caps if already configured.
update public.plans pro
   set category_limits = coalesce(starter.category_limits, '{}'::jsonb) || coalesce(pro.category_limits, '{}'::jsonb)
  from public.plans starter
 where lower(starter.name) = 'starter'
   and lower(pro.name) = 'pro'
   and coalesce(pro.category_limits, '{}'::jsonb) = '{}'::jsonb;

comment on function public.agent_subscription_plan_for_order(uuid) is
  'Returns plan limits and period usage only for a subscription order assigned to the authenticated pickup/delivery agent.';

-- Align monthly allowance accounting with category billing: only category-eligible pieces consume the plan allowance.
create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sp public.subscription_pickups; _sub public.subscriptions; _plan public.plans;
  _pieces integer; _used integer; _available integer; _total_overage integer;
  _excluded_pieces integer := 0; _category_overage integer := 0; _included_pieces integer := 0;
  _overage integer; _price bigint; _line record; _category_key text;
  _category_limit integer; _category_used integer;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription' or new.subscription_pickup_id is null then return new; end if;
  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;
  select coalesce(sum(qty),0)::integer into _pieces from public.order_items where order_id = new.id and removed_at is null;
  select coalesce(sum(case
      when coalesce((_plan.category_limits ->> usage.category_key)::integer, -1) = 0 then 0
      when coalesce((_plan.category_limits ->> usage.category_key)::integer, -1) > 0 then least(usage.pieces, (_plan.category_limits ->> usage.category_key)::integer)
      else usage.pieces end), 0)::integer into _used
    from (select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key,
                 sum(oi.qty)::integer as pieces
            from public.subscription_pickups prior
            join public.orders o on o.subscription_pickup_id = prior.id
            join public.order_items oi on oi.order_id = o.id and oi.removed_at is null
            left join public.items i on i.id = oi.item_id
            left join public.item_categories ic on ic.id = i.category_id
           where prior.subscription_id = _sub.id and prior.id <> _sp.id
             and prior.scheduled_for >= _sub.current_period_start and prior.scheduled_for < _sub.current_period_end
             and prior.status not in ('missed','skipped') group by 1) usage;
  _available := greatest(0, _plan.pieces_per_month - _used);
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
          where prior.subscription_id = _sub.id and prior.id <> _sp.id and prior.scheduled_for >= _sub.current_period_start
            and prior.scheduled_for < _sub.current_period_end and prior.status not in ('missed','skipped'));
      if _category_limit = 0 then null;
      else _category_overage := _category_overage + greatest(0, _line.qty + _category_used - _category_limit);
           _included_pieces := _included_pieces + least(_line.qty, greatest(0, _category_limit - _category_used)); end if;
    else _included_pieces := _included_pieces + _line.qty; end if;
  end loop;
  select coalesce(sum(_line.qty), 0)::integer into _excluded_pieces from (
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key, sum(oi.qty)::integer as qty
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  ) _line where _plan.category_limits ? _line.category_key and coalesce((_plan.category_limits ->> _line.category_key)::integer, 0) = 0;
  _total_overage := greatest(0, _included_pieces - _available);
  _overage := _excluded_pieces + _category_overage + _total_overage;
  _price := greatest(0, coalesce(_plan.overage_price_kobo,0));
  update public.subscription_pickups set pieces_counted = _pieces, overage_pieces = _overage, overage_kobo = _overage::bigint * _price, status = 'collected' where id = _sp.id;
  if _overage = 0 then update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted'; end if;
  return new;
end
$function$;
