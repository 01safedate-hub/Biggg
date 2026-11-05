-- Bind walk-in orders to the station where the staff member created them.
-- Backfill historical walk-ins where the creator still has a staff station.
update public.orders o
set zone_id = sp.station_zone_id
from public.staff_profiles sp
where o.source = 'walk_in'
  and o.created_by = sp.user_id
  and o.zone_id is null
  and sp.station_zone_id is not null;

create or replace function public.desk_create_walkin_order(_customer uuid, _notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid; _station uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = _customer and p.status = 'active' and not exists (select 1 from public.user_roles r where r.user_id = p.id)) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where customer_id = _customer and source = 'walk_in' and status in ('agent_arrived', 'counted')) >= 3 then
    raise exception 'too_many_unpaid' using errcode = 'P0001';
  end if;
  select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
  if _station is null then raise exception 'staff_station_required' using errcode = 'P0001'; end if;
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo, notes, created_by, zone_id)
  values (_customer, 'walk_in', 'agent_arrived', 0, 0, nullif(trim(_notes), ''), auth.uid(), _station)
  returning id into _id;
  return _id;
end $$;

create or replace function public.start_washing(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _station uuid;
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if private.has_role('washer'::public.staff_role) and not private.is_shift_manager() then
    select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
    if _station is null or not exists(select 1 from public.orders o where o.id = _order and o.zone_id = _station and o.status = 'received') then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;
  update public.orders set status = 'in_house' where id = _order and status = 'received'
    and (private.is_shift_manager() or zone_id = (select station_zone_id from public.staff_profiles where user_id = auth.uid()));
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

create or replace function public.mark_ready(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint; _station uuid;
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'in_house' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if private.has_role('washer'::public.staff_role) and not private.is_shift_manager() then
    select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
    if _station is null or _o.zone_id is distinct from _station then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  end if;
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
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

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select private.is_money_staff())
  or pickup_agent_id = (select auth.uid())
  or delivery_agent_id = (select auth.uid())
  or (
    (select private.has_role('washer'::public.staff_role))
    and status in ('received', 'in_house')
    and zone_id = (select station_zone_id from public.staff_profiles where user_id = (select auth.uid()))
  )
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
        or (
          (select private.has_role('washer'::public.staff_role))
          and o.status in ('received', 'in_house')
          and o.zone_id = (select station_zone_id from public.staff_profiles where user_id = (select auth.uid()))
        )
      )
  )
);

revoke execute on function public.start_washing(uuid), public.mark_ready(uuid) from public, anon;
grant execute on function public.start_washing(uuid), public.mark_ready(uuid) to authenticated;
