-- Category corrections on subscription orders are for garment classification only.
-- Do not generate item top-ups or refunds: plan usage is based on total pieces.
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

  update public.order_items
     set item_id = _i.id, name = _i.name, category_name = _cat, unit_price_kobo = _i.price_kobo,
         check_state = 'ok',
         check_note = 'Corrected from ' || _l.name || ' (' || coalesce(_l.category_name, '') || '): ' || trim(_note),
         checked_by = auth.uid(), checked_at = now()
   where id = _line;

  insert into public.order_events (order_id, actor_id, event, detail)
  values (_o.id, auth.uid(), 'item_corrected',
          jsonb_build_object('line', _line, 'from', _l.name, 'to', _i.name,
                             'old_price_kobo', _l.unit_price_kobo, 'new_price_kobo', _i.price_kobo,
                             'qty', _l.qty, 'note', trim(_note)));

  if _o.source = 'subscription' then
    return jsonb_build_object('due_kobo', 0, 'subscription', true);
  end if;
  perform private.reconcile_items(_o.id);
  _due := private.items_due(_o.id);
  if _due > 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'A small top-up is needed',
            'We corrected the category of one of your items. Please pay the difference in the app.', 'order_status', _o.id);
  elsif _due < 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'You are getting money back',
            'We corrected the category of one of your items. The difference will be refunded to you.', 'order_status', _o.id);
  end if;
  return jsonb_build_object('due_kobo', _due);
end
$function$;
