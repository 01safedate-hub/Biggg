-- Shelves: A1-G9 (7 rows x 9). Staff must say where finished clothes are kept when marking an order ready.
-- One shelf can hold many orders and one order can take many shelves.
-- A shelf entry is released automatically when the order is delivered, closed or cancelled.

create table public.order_shelves (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shelf text not null check (shelf ~ '^[A-G][1-9]$'),
  placed_by uuid references public.profiles(id),
  placed_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index order_shelves_active_uq on public.order_shelves (order_id, shelf) where released_at is null;
create index order_shelves_shelf_active on public.order_shelves (shelf) where released_at is null;
create index order_shelves_order on public.order_shelves (order_id);

alter table public.order_shelves enable row level security;
create policy order_shelves_read on public.order_shelves for select to authenticated
  using ((select private.is_money_staff()) or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));
revoke insert, update, delete on public.order_shelves from anon, authenticated;

-- Normalises and checks a shelf list: trims, upper-cases, removes duplicates, 1 to 10 shelves.
create or replace function private.clean_shelves(_shelves text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare _out text[];
begin
  select coalesce(array_agg(distinct s order by s), '{}') into _out
    from (select upper(replace(trim(x), ' ', '')) s from unnest(coalesce(_shelves, '{}')) x) t
   where s <> '';
  if cardinality(_out) = 0 then raise exception 'shelf_required' using errcode = 'P0001'; end if;
  if cardinality(_out) > 10 then raise exception 'too_many_shelves' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(_out) s where s !~ '^[A-G][1-9]$') then raise exception 'invalid_shelf' using errcode = 'P0001'; end if;
  return _out;
end $$;
revoke all on function private.clean_shelves(text[]) from public, anon, authenticated;

create or replace function private.put_on_shelves(_order uuid, _shelves text[])
returns void language plpgsql security definer set search_path = '' as $$
declare _clean text[] := private.clean_shelves(_shelves);
begin
  update public.order_shelves set released_at = now()
   where order_id = _order and released_at is null and not (shelf = any(_clean));
  insert into public.order_shelves (order_id, shelf, placed_by)
  select _order, s, auth.uid() from unnest(_clean) s
   where not exists (select 1 from public.order_shelves x where x.order_id = _order and x.shelf = s and x.released_at is null);
  insert into public.order_events (order_id, actor_id, event, detail)
  values (_order, auth.uid(), 'shelved', jsonb_build_object('shelves', to_jsonb(_clean)));
end $$;
revoke all on function private.put_on_shelves(uuid, text[]) from public, anon, authenticated;

-- mark_ready now requires the shelf. Body is unchanged apart from the shelf step.
drop function if exists public.mark_ready(uuid);
create or replace function public.mark_ready(_order uuid, _shelves text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint; _station uuid; _transport_paid boolean;
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
  perform private.put_on_shelves(_order, _shelves);
  if _o.source = 'walk_in' then
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  if _o.source = 'subscription' then
    select coalesce(sp.transport_paid, false) into _transport_paid from public.subscription_pickups sp where sp.id = _o.subscription_pickup_id;
    -- Hub drop-offs (no pickup address) are collected from the hub.
    if _o.pickup_lat is null then
      update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    else
      update public.orders set status = 'out_for_delivery', ready_at = now(),
        delivery_fare_kobo = case when coalesce(_transport_paid, false) then _o.delivery_fare_kobo else 0 end
      where id = _order;
    end if;
    return;
  end if;
  if _o.source = 'online' and coalesce(_o.delivery_fare_kobo, 0) > 0 then
    update public.orders set status = 'out_for_delivery', ready_at = now() where id = _order;
    return;
  end if;
  if _o.source = 'one_time' then
    if coalesce(_o.return_prepaid_kobo, 0) > 0 then
      -- Return was paid at booking: deliver to the booked address unless the customer changes it.
      update public.orders
         set status = 'ready', ready_at = now(), delivery_fare_kobo = 0,
             fulfillment_choice = coalesce(fulfillment_choice, 'deliver'),
             return_delivery_address = coalesce(return_delivery_address, pickup_address),
             return_delivery_lat = coalesce(return_delivery_lat, pickup_lat),
             return_delivery_lng = coalesce(return_delivery_lng, pickup_lng),
             return_delivery_distance_km = coalesce(return_delivery_distance_km, pickup_distance_km)
       where id = _order;
      insert into public.order_events (order_id, actor_id, event, detail)
      values (_order, auth.uid(), 'return_prepaid', jsonb_build_object('prepaid_kobo', _o.return_prepaid_kobo));
      return;
    end if;
    _fare := greatest(0, coalesce(_o.pickup_fare_kobo, 0));
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
    return;
  end if;
  select value into _f from public.settings where key = 'fare_delivery';
  _round := greatest(1, coalesce((_f->>'round_to_kobo')::bigint, 5000));
  _min := coalesce((_f->>'min_fare_kobo')::bigint, 0);
  _fare := greatest(_min, (round(coalesce(_o.pickup_distance_km, 0) * 2 * coalesce((_f->>'rate_per_km_kobo')::numeric, 0) / _round) * _round)::bigint);
  update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
end
$function$;
revoke all on function public.mark_ready(uuid, text[]) from public, anon;
grant execute on function public.mark_ready(uuid, text[]) to authenticated;

-- Move an order to other shelves while it is still in the building.
create or replace function public.set_order_shelves(_order uuid, _shelves text[])
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _station uuid;
begin
  if not private.is_active() or not (private.is_money_staff() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _o from public.orders where id = _order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('ready', 'awaiting_delivery_fare', 'out_for_delivery', 'failed_delivery') then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;
  if not private.is_money_staff() then
    select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
    if _station is null or _o.zone_id is distinct from _station then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  end if;
  perform private.put_on_shelves(_order, _shelves);
end $$;
revoke all on function public.set_order_shelves(uuid, text[]) from public, anon;
grant execute on function public.set_order_shelves(uuid, text[]) to authenticated;

-- Free the shelves once the clothes have left for good.
create or replace function private.release_order_shelves()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.order_shelves set released_at = now() where order_id = new.id and released_at is null;
  return null;
end $$;
revoke all on function private.release_order_shelves() from public, anon, authenticated;
create trigger orders_release_shelves after update of status on public.orders
  for each row when (old.status is distinct from new.status and new.status in ('delivered', 'closed', 'cancelled'))
  execute function private.release_order_shelves();

-- Shelf map: every active shelf entry with its order. Names are shown to desk staff only.
create or replace function public.shelf_board()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _names boolean := private.is_money_staff();
begin
  if not private.is_active() or not (_names or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'shelf', s.shelf, 'order_id', o.id, 'order_no', o.order_no, 'status', o.status,
      'since', s.placed_at, 'customer', case when _names then p.full_name end,
      'pieces', (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o.id and i.removed_at is null))
      order by s.shelf, s.placed_at)
      from public.order_shelves s
      join public.orders o on o.id = s.order_id
      left join public.profiles p on p.id = o.customer_id
     where s.released_at is null), '[]'::jsonb);
end $$;
revoke all on function public.shelf_board() from public, anon;
grant execute on function public.shelf_board() to authenticated;
