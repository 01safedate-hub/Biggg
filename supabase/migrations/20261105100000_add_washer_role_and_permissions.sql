-- Washer role: limited wash-queue access, separate from secretary/shift-manager permissions.
alter type public.staff_role add value if not exists 'washer';

-- Washer is not a shift manager. These two workflow transitions are its entire order authority.
create or replace function public.start_washing(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.orders set status = 'in_house' where id = _order and status = 'received';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

create or replace function public.mark_ready(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint;
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'in_house' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;

  -- Preserve current fulfillment/fare behavior exactly, including subscription no-fare dispatch.
  if _o.source = 'walk_in' then
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  if _o.source = 'subscription' then
    update public.orders set status = 'out_for_delivery', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  if _o.source = 'online' and coalesce(_o.delivery_fare_kobo, 0) > 0 then
    update public.orders set status = 'out_for_delivery', ready_at = now() where id = _order;
    return;
  end if;
  if _o.source = 'one_time' then
    _fare := greatest(0, coalesce(_o.pickup_fare_kobo, 0));
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
    return;
  end if;

  select value into _f from public.settings where key = 'fare_delivery';
  _round := greatest(1, coalesce((_f->>'round_to_kobo')::bigint, 5000));
  _min := coalesce((_f->>'min_fare_kobo')::bigint, 0);
  _fare := greatest(_min, (round(coalesce(_o.pickup_distance_km, 0) * 2 * coalesce((_f->>'rate_per_km_kobo')::numeric, 0) / _round) * _round)::bigint);
  update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
end $$;

revoke execute on function public.start_washing(uuid), public.mark_ready(uuid) from public, anon;
grant execute on function public.start_washing(uuid), public.mark_ready(uuid) to authenticated;

-- Keep the washer-specific read-only queue visibility isolated from money/receiving RLS helpers.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.is_money_staff())
  or pickup_agent_id = (select auth.uid())
  or delivery_agent_id = (select auth.uid())
  or (select private.has_role('washer'::public.staff_role))
);
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.customer_id = (select auth.uid())
        or (select private.is_money_staff())
        or o.pickup_agent_id = (select auth.uid())
        or o.delivery_agent_id = (select auth.uid())
        or (select private.has_role('washer'::public.staff_role))
      )
  )
);
