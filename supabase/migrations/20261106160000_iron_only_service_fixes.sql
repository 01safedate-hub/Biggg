-- Follow-up fixes for the iron-only service (the service column, settings.iron_only, private.service_price_kobo,
-- public.item_service_prices, public.save_iron_only_settings and the 4-argument agent_set_item / desk_set_item were applied earlier).
--
-- 1. The 4-argument agent_set_item and desk_set_item overloads were executable by anon. Match the 3-argument versions.
-- 2. correct_order_item repriced a corrected iron-only line at the dry-clean price and dropped the "(iron only)" label.
-- 3. desk_split_instant ignored the service: with a dry-clean and an iron-only line for the same item it picked either one,
--    and the instant child order lost the service on every line.

revoke execute on function public.agent_set_item(uuid, uuid, integer, text) from public, anon;
revoke execute on function public.desk_set_item(uuid, uuid, integer, text) from public, anon;
grant execute on function public.agent_set_item(uuid, uuid, integer, text) to authenticated;
grant execute on function public.desk_set_item(uuid, uuid, integer, text) to authenticated;

create or replace function public.correct_order_item(_line uuid, _new_item uuid, _note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _l public.order_items;
  _o public.orders;
  _i public.items;
  _cat text;
  _due bigint;
  _name text;
  _price bigint;
begin
  if not private.is_shift_manager() or not private.is_active() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _l from public.order_items where id = _line and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _l.order_id for update;
  if not found or _o.status <> 'count_confirmed' then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(_note, ''))) < 3 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select * into _i from public.items where id = _new_item and active;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  select name into _cat from public.item_categories where id = _i.category_id;

  _name := _i.name || case when _l.service = 'iron_only' then ' (iron only)' else '' end;
  _price := private.service_price_kobo(_i.id, _l.service);

  update public.order_items
     set item_id = _i.id,
         name = _name,
         category_name = _cat,
         unit_price_kobo = _price,
         check_state = 'ok',
         check_note = 'Corrected from ' || _l.name || ' (' || coalesce(_l.category_name, '') || '): ' || trim(_note),
         checked_by = auth.uid(),
         checked_at = now()
   where id = _line;

  insert into public.order_events (order_id, actor_id, event, detail)
  values (_o.id, auth.uid(), 'item_corrected',
          jsonb_build_object('line', _line, 'from', _l.name, 'to', _name,
                             'old_price_kobo', _l.unit_price_kobo, 'new_price_kobo', _price,
                             'service', _l.service, 'qty', _l.qty, 'note', trim(_note)));

  if _o.source = 'subscription' then
    -- Subscription allowance is based on piece quantities, never category prices.
    return jsonb_build_object('due_kobo', 0, 'subscription', true);
  end if;

  perform private.reconcile_items(_o.id);
  _due := private.items_due(_o.id);
  if _due > 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'A small top-up is needed',
            'We corrected the category of one of your items. Please pay the difference in the app.',
            'order_status', _o.id);
  elsif _due < 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'You are getting money back',
            'We corrected the category of one of your items. The difference will be refunded to you.',
            'order_status', _o.id);
  end if;
  return jsonb_build_object('due_kobo', _due);
end
$function$;

create or replace function public.desk_split_instant(_order uuid, _lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare _o public.orders; _cfg jsonb := private.instant_cfg(); _l jsonb; _line public.order_items; _q int; _svc text; _child uuid; _left int; _moved int := 0;
begin
  _o := private.walkin_order(_order, array['agent_arrived']::public.order_status[]);
  if not coalesce((_cfg->>'enabled')::boolean, false) then raise exception 'instant_off' using errcode = 'P0001'; end if;
  if jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 or jsonb_array_length(_lines) > 60 then raise exception 'invalid_instant' using errcode = 'P0001'; end if;
  select coalesce(sum(qty), 0) into _left from public.order_items where order_id = _order and removed_at is null;
  for _l in select * from jsonb_array_elements(_lines) loop
    _q := (_l->>'qty')::int;
    _svc := coalesce(nullif(_l->>'service', ''), 'dry_clean');
    select * into _line from public.order_items where order_id = _order and item_id = (_l->>'item')::uuid and service = _svc and removed_at is null;
    if not found or _q is null or _q < 1 or _q > _line.qty then raise exception 'invalid_instant' using errcode = 'P0001'; end if;
    _moved := _moved + _q;
  end loop;
  if _moved = _left then
    update public.orders set instant = true where id = _order;
    insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'instant_on', jsonb_build_object('items', _moved, 'whole_order', true));
    return _order;
  end if;
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo, notes, created_by, parent_order_id, instant)
  values (_o.customer_id, 'walk_in', 'agent_arrived', 0, 0, 'Instant items from order #' || _o.order_no, auth.uid(), _order, true) returning id into _child;
  for _l in select * from jsonb_array_elements(_lines) loop
    _q := (_l->>'qty')::int;
    _svc := coalesce(nullif(_l->>'service', ''), 'dry_clean');
    select * into _line from public.order_items where order_id = _order and item_id = (_l->>'item')::uuid and service = _svc and removed_at is null;
    insert into public.order_items (order_id, item_id, name, category_name, qty, unit_price_kobo, service, created_by, note)
    values (_child, _line.item_id, _line.name, _line.category_name, _q, _line.unit_price_kobo, _line.service, auth.uid(), _line.note);
    if _q = _line.qty then update public.order_items set removed_at = now(), removed_by = auth.uid() where id = _line.id;
    else update public.order_items set qty = qty - _q where id = _line.id; end if;
  end loop;
  insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'instant_split', jsonb_build_object('child', _child, 'items', _moved));
  insert into public.order_events (order_id, actor_id, event, detail) values (_child, auth.uid(), 'instant_on', jsonb_build_object('items', _moved, 'parent', _order));
  return _child;
end $function$;
