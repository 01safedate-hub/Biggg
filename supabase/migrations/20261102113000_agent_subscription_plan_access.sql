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

  select coalesce(sum(sp.pieces_counted), 0)::integer into _used
    from public.subscription_pickups sp
   where sp.subscription_id = _sub.id
     and sp.id <> _pickup.id
     and sp.scheduled_for >= _sub.current_period_start
     and sp.scheduled_for < _sub.current_period_end
     and sp.status not in ('missed','skipped');

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
