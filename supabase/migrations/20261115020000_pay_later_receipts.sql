-- Pay later fix: before pay later existed, an order reached count_confirmed only after the customer paid, so the
-- "Payment received" receipt was sent at that step. A pay-later order now reaches count_confirmed unpaid.
--   * The receipt is sent only when nothing is owed; for pay-later orders it is sent when money staff confirm the payment.
--   * The in-app notice and the order timeline no longer say "paid" for an unpaid pay-later order.

create or replace function private.enqueue_items_receipt(_order uuid, _key text)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _email text; _walk boolean; _name text; _lines jsonb; _pay record;
begin
  select * into _o from public.orders where id = _order;
  if not found then return; end if;
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = _o.customer_id;
  if _email is null or _email like '%.invalid' or coalesce(_walk, false) then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty, 'unit_kobo', oi.unit_price_kobo, 'line_kobo', oi.qty * oi.unit_price_kobo) order by oi.created_at), '[]'::jsonb)
    into _lines from public.order_items oi where oi.order_id = _order and oi.removed_at is null;
  select reference, mode, paid_at into _pay from public.payments
   where order_id = _order and purpose = 'items' and kind = 'payment' and status = 'success' order by created_at desc limit 1;
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (_o.customer_id, _email, 'payment_receipt',
          jsonb_build_object('order_id', _o.id, 'order_no', _o.order_no, 'name', _name, 'lines', _lines,
                             'discount_kobo', _o.discount_kobo, 'instant_fee_kobo', _o.instant_fee_kobo,
                             'total_kobo', private.bill_total(_o.id), 'reference', _pay.reference, 'mode', _pay.mode, 'paid_at', coalesce(_pay.paid_at, now())),
          _key)
  on conflict (idempotency_key) do nothing;
end $$;
revoke all on function private.enqueue_items_receipt(uuid, text) from public, anon, authenticated;

create or replace function private.order_customer_emails()
returns trigger language plpgsql security definer set search_path = '' as $$
declare _email text; _walk boolean; _name text; _hub jsonb; _biz jsonb;
begin
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = new.customer_id;
  if _email is null or _email like '%.invalid' or coalesce(_walk, false) then return null; end if;

  if new.status = 'count_confirmed' and old.status is distinct from 'count_confirmed' and new.source <> 'subscription'
     and private.items_due(new.id) <= 0 then
    perform private.enqueue_items_receipt(new.id, 'receipt-' || new.id);
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
end $$;

create or replace function private.order_status_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare _title text; _email text; _walk boolean; _collect boolean; _unpaid boolean;
begin
  insert into public.order_events (order_id, actor_id, event, detail) values (new.id, auth.uid(), 'status', jsonb_build_object('from', old.status, 'to', new.status));
  select is_walk_in, email into _walk, _email from public.profiles where id = new.customer_id;
  if coalesce(_walk, false) then return null; end if;
  _collect := new.status = 'ready' and coalesce(new.fulfillment_choice, '') = 'collect';
  _unpaid := new.pay_later_at is not null and private.order_amount_due(new) > 0;
  _title := case new.status
    when 'awaiting_dispatch' then 'Pickup booked. We are assigning an agent'
    when 'agent_assigned' then 'Your agent is on the way'
    when 'agent_arrived' then 'Agent confirmed at your door'
    when 'counted' then 'Your bill is ready. Pay on your phone, never in cash'
    when 'count_confirmed' then case
        when _unpaid and new.payment_claim is not null then 'Clothes counted. We are confirming your transfer'
        when _unpaid then 'Clothes counted. Your bill is still to be paid'
        else 'Payment received. Your agent is heading to us' end
    when 'received' then 'We have received your clothes'
    when 'in_house' then 'We are washing your clothes'
    when 'ready' then case
        when _unpaid then 'Your clothes are ready. Please pay your bill so we can release them'
        when _collect then 'Your clothes are ready for collection'
        else 'Your clothes are ready. Pay the delivery fare in the app and we will bring them' end
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
end $$;

create or replace function public.order_timeline(_order uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _o public.orders; _steps jsonb; _t jsonb;
begin
  select * into _o from public.orders where id = _order;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not coalesce(_o.customer_id = auth.uid() or _o.pickup_agent_id = auth.uid() or _o.delivery_agent_id = auth.uid() or private.is_money_staff(), false) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  with first_hit as (
    select detail->>'to' as st, min(created_at) as at, (array_agg(actor_id order by created_at))[1] as actor
      from public.order_events where order_id = _order and event = 'status' group by detail->>'to'
  ), chain(ord, st, label) as (values
    (1, 'awaiting_dispatch', 'Fare paid, waiting for an agent'), (2, 'agent_assigned', 'Agent assigned'), (3, 'agent_arrived', 'Agent at the door (customer entered the code)'),
    (4, 'counted', 'Clothes counted and bill sent'),
    (5, 'count_confirmed', case when _o.pay_later_at is not null then 'Count confirmed, customer to pay later' else 'Customer paid the bill' end),
    (6, 'received', 'Secretary received the clothes')
  ), rows as (
    select c.ord, c.st, c.label, f.at, f.actor, p.full_name as who from chain c join first_hit f on f.st = c.st left join public.profiles p on p.id = f.actor
  ), timed as (
    select r.*, extract(epoch from (r.at - coalesce(lag(r.at) over (order by r.ord), _o.created_at)))::bigint as secs from rows r
  )
  select jsonb_agg(jsonb_build_object('key', st, 'label', label, 'at', at, 'by', who, 'seconds_from_previous', secs) order by ord) into _steps from timed;
  _t := jsonb_build_object('booked_at', _o.created_at, 'steps', coalesce(_steps, '[]'::jsonb),
    'agent', (select full_name from public.profiles where id = _o.pickup_agent_id));
  return _t;
end $$;

-- Send the real receipt when money staff confirm a pay-later payment.
create or replace function private.pay_later_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.paid_confirmed_at is not null and old.paid_confirmed_at is null then
    perform private.enqueue_items_receipt(new.id, 'receipt-paid-' || new.id);
  end if;
  return null;
end $$;
revoke all on function private.pay_later_receipt() from public, anon, authenticated;
drop trigger if exists orders_pay_later_receipt on public.orders;
create trigger orders_pay_later_receipt after update of paid_confirmed_at on public.orders
  for each row execute function private.pay_later_receipt();
