-- New and richer emails (the email-worker edge function has the matching templates).
-- 1. count_summary now carries each line's service, unit price and line amount plus the bill total (not for subscription pickups, which have no bill).
-- 2. payment_receipt: itemised receipt when an order moves to count_confirmed (clothes bill paid). Replaces the one-line "Payment received" email for non-subscription orders.
-- 3. ready_collect: "ready for collection" email with hub address and opening hours when the customer chose to collect. Replaces the one-line "ready" email in that case.
-- 4. agent_job: email to a delivery or commission agent when a pickup or delivery is assigned (sent from the in-app job notification).
-- In-app notifications are unchanged.

create or replace function private.queue_count_summary(_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare _o public.orders; _root public.orders; _email text; _walk boolean; _name text; _items jsonb; _stains jsonb; _total int; _sum bigint; _fee bigint; _prices boolean;
begin
  select * into _o from public.orders where id = _order;
  if not found then return; end if;
  select * into _root from public.orders where id = coalesce(_o.parent_order_id, _o.id);
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = _o.customer_id;
  if _email is null or _email like '%.invalid' or coalesce(_walk, false) then return; end if;
  _prices := _root.source <> 'subscription';
  select coalesce(jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty, 'instant', o.instant, 'service', oi.service,
           'unit_kobo', oi.unit_price_kobo, 'line_kobo', oi.qty * oi.unit_price_kobo,
           'stain', exists (select 1 from public.order_photos p join public.orders po on po.id = p.order_id
                             where p.kind = 'stain' and (po.id = _root.id or po.parent_order_id = _root.id)
                               and (p.order_item_id = oi.id or p.note = oi.name or p.note like oi.name || ': %'))) order by o.created_at, oi.created_at), '[]'::jsonb),
         coalesce(sum(oi.qty), 0), coalesce(sum(oi.qty * oi.unit_price_kobo), 0)
    into _items, _total, _sum
    from public.orders o join public.order_items oi on oi.order_id = o.id and oi.removed_at is null
   where o.id = _root.id or o.parent_order_id = _root.id;
  select coalesce(sum(private.instant_fee_for(o.id)), 0) into _fee
    from public.orders o where (o.id = _root.id or o.parent_order_id = _root.id) and o.instant;
  select coalesce(jsonb_agg(coalesce(p.note, 'Hard stain') order by p.created_at), '[]'::jsonb) into _stains
    from public.order_photos p join public.orders po on po.id = p.order_id
   where p.kind = 'stain' and (po.id = _root.id or po.parent_order_id = _root.id);
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (_o.customer_id, _email, 'count_summary',
          jsonb_build_object('order_id', _root.id, 'order_no', _root.order_no, 'name', _name, 'items', _items, 'total', _total, 'stains', _stains,
                             'show_prices', _prices, 'items_kobo', _sum, 'instant_fee_kobo', _fee, 'bill_kobo', _sum + _fee),
          'count-summary-' || _root.id)
  on conflict (idempotency_key) do nothing;
end $function$;

-- Generic status emails: keep the in-app notification, but skip the one-line email when a richer email replaces it.
create or replace function private.order_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare _title text; _email text; _walk boolean; _collect boolean;
begin
  insert into public.order_events (order_id, actor_id, event, detail) values (new.id, auth.uid(), 'status', jsonb_build_object('from', old.status, 'to', new.status));
  select is_walk_in, email into _walk, _email from public.profiles where id = new.customer_id;
  if coalesce(_walk, false) then return null; end if;
  _collect := new.status = 'ready' and coalesce(new.fulfillment_choice, '') = 'collect';
  _title := case new.status
    when 'awaiting_dispatch' then 'Pickup booked. We are assigning an agent'
    when 'agent_assigned' then 'Your agent is on the way'
    when 'agent_arrived' then 'Agent confirmed at your door'
    when 'counted' then 'Your bill is ready. Pay on your phone, never in cash'
    when 'count_confirmed' then 'Payment received. Your agent is heading to us'
    when 'received' then 'We have received your clothes'
    when 'in_house' then 'We are washing your clothes'
    when 'ready' then case when _collect then 'Your clothes are ready for collection' else 'Your clothes are ready. Pay the delivery fare in the app and we will bring them' end
    when 'out_for_delivery' then 'Your clothes are clean and ready. We are assigning your delivery agent'
    when 'delivered' then 'Delivered. Thank you'
    when 'failed_delivery' then 'We could not deliver your clothes'
    when 'cancelled' then 'Your booking was cancelled. If you paid, your refund is being arranged'
    else null end;
  if _title is not null then
    insert into public.user_notifications (user_id, title, kind, order_id) values (new.customer_id, _title, 'order_status', new.id);
    if _email is not null and not _collect and not (new.status = 'count_confirmed' and new.source <> 'subscription') then
      insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
      values (new.customer_id, _email, 'order_status', jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'status', new.status, 'title', _title), 'order-' || new.id || '-' || new.status)
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return null;
end $function$;

create or replace function private.order_customer_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare _email text; _walk boolean; _name text; _lines jsonb; _pay record; _hub jsonb; _biz jsonb;
begin
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = new.customer_id;
  if _email is null or _email like '%.invalid' or coalesce(_walk, false) then return null; end if;

  if new.status = 'count_confirmed' and old.status is distinct from 'count_confirmed' and new.source <> 'subscription' then
    select coalesce(jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty, 'unit_kobo', oi.unit_price_kobo, 'line_kobo', oi.qty * oi.unit_price_kobo) order by oi.created_at), '[]'::jsonb)
      into _lines from public.order_items oi where oi.order_id = new.id and oi.removed_at is null;
    select reference, mode, paid_at into _pay from public.payments
     where order_id = new.id and purpose = 'items' and kind = 'payment' and status = 'success' order by created_at desc limit 1;
    insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
    values (new.customer_id, _email, 'payment_receipt',
            jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'name', _name, 'lines', _lines,
                               'discount_kobo', new.discount_kobo, 'instant_fee_kobo', new.instant_fee_kobo,
                               'total_kobo', private.bill_total(new.id), 'reference', _pay.reference, 'mode', _pay.mode, 'paid_at', coalesce(_pay.paid_at, now())),
            'receipt-' || new.id)
    on conflict (idempotency_key) do nothing;
  end if;

  if new.status = 'ready' and coalesce(new.fulfillment_choice, '') = 'collect'
     and (old.status is distinct from 'ready' or old.fulfillment_choice is distinct from new.fulfillment_choice) then
    select value into _hub from public.settings where key = 'hub';
    select value into _biz from public.settings where key = 'business';
    insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
    values (new.customer_id, _email, 'ready_collect',
            jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'name', _name, 'address', _hub->>'address', 'maps_url', _hub->>'maps_url',
                               'opening_time', _biz->>'opening_time', 'closing_time', _biz->>'closing_time'),
            'ready-collect-' || new.id)
    on conflict (idempotency_key) do nothing;
  end if;
  return null;
end $function$;

drop trigger if exists orders_customer_emails on public.orders;
create trigger orders_customer_emails after update of status, fulfillment_choice on public.orders
  for each row execute function private.order_customer_emails();

create or replace function private.agent_job_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare _email text; _name text; _o public.orders; _delivery boolean;
begin
  if new.kind <> 'job' or new.order_id is null then return null; end if;
  select coalesce(p.email, u.email), p.full_name into _email, _name
    from public.profiles p left join auth.users u on u.id = p.id where p.id = new.user_id;
  if _email is null or _email like '%.invalid' then return null; end if;
  select * into _o from public.orders where id = new.order_id;
  if not found then return null; end if;
  _delivery := new.title ilike '%delivery%';
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (new.user_id, _email, 'agent_job',
          jsonb_build_object('title', new.title, 'name', _name, 'order_id', _o.id, 'order_no', _o.order_no, 'delivery', _delivery,
                             'address', case when _delivery then coalesce(to_jsonb(_o)->>'return_delivery_address', _o.pickup_address) else _o.pickup_address end),
          'agent-job-' || new.id)
  on conflict (idempotency_key) do nothing;
  return null;
end $function$;

drop trigger if exists user_notifications_agent_job_email on public.user_notifications;
create trigger user_notifications_agent_job_email after insert on public.user_notifications
  for each row execute function private.agent_job_email();
