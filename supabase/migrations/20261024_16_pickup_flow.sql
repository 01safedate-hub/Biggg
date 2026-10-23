-- Pickup flow: booking, dispatch, arrival code, agent itemises and bills, customer pays online, secretary checks and receives, timeline.

-- 1. Online providers and per-line checks.
alter table public.payments drop constraint payments_mode_check;
alter table public.payments add constraint payments_mode_check check (mode = any (array['paystack','flutterwave','cash','transfer','pos']));
alter policy payments_read on public.payments using (
  customer_id = (select auth.uid()) or recorded_by = (select auth.uid()) or (select private.is_super_admin())
  or ((select private.is_admin()) and mode in ('paystack','flutterwave')));

alter table public.order_items
  add column removed_at timestamptz, add column removed_by uuid references auth.users(id) on delete set null,
  add column check_state text not null default 'pending' check (check_state in ('pending','ok','flagged')),
  add column check_note text, add column checked_by uuid references auth.users(id) on delete set null, add column checked_at timestamptz;

create or replace function private.order_items_total() returns trigger language plpgsql security definer set search_path = '' as $$
declare _oid uuid;
begin
  if tg_op = 'DELETE' then _oid := old.order_id; else _oid := new.order_id; end if;
  update public.orders set items_total_kobo = (select coalesce(sum(line_total_kobo), 0) from public.order_items where order_id = _oid and removed_at is null) where id = _oid;
  return null;
end $$;

create or replace function private.order_status_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare _title text; _email text;
begin
  insert into public.order_events (order_id, actor_id, event, detail) values (new.id, auth.uid(), 'status', jsonb_build_object('from', old.status, 'to', new.status));
  _title := case new.status
    when 'awaiting_dispatch' then 'Pickup booked. We are assigning an agent'
    when 'agent_assigned' then 'Your agent is on the way'
    when 'agent_arrived' then 'Agent confirmed at your door'
    when 'counted' then 'Your bill is ready. Pay on your phone, never in cash'
    when 'count_confirmed' then 'Payment received. Your agent is heading to us'
    when 'received' then 'We have received your clothes'
    when 'in_house' then 'We are washing your clothes'
    when 'ready' then 'Your clothes are ready'
    when 'out_for_delivery' then 'Your delivery is on the way'
    when 'delivered' then 'Delivered. Thank you'
    when 'failed_delivery' then 'We could not deliver your clothes'
    else null end;
  if _title is not null then
    insert into public.user_notifications (user_id, title, kind, order_id) values (new.customer_id, _title, 'order_status', new.id);
    select email into _email from public.profiles where id = new.customer_id;
    if _email is not null then
      insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
      values (new.customer_id, _email, 'order_status', jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'status', new.status, 'title', _title), 'order-' || new.id || '-' || new.status)
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return null;
end $$;

create or replace function private.online_money_point() returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.money_points where kind = 'online' and active order by created_at limit 1
$$;

-- 2. Customer books a pickup. The fare is paid online first; nothing is ever paid in cash to an agent.
create or replace function public.book_pickup(_lat double precision, _lng double precision, _address text, _notes text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _q jsonb; _id uuid; _a text := nullif(trim(_address), '');
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where customer_id = auth.uid() and status = 'awaiting_fare_payment') >= 3 then raise exception 'too_many_unpaid' using errcode = 'P0001'; end if;
  _q := public.quote_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _q->>'fare_kobo' is null then raise exception 'hub_not_set' using errcode = 'P0001'; end if;
  insert into public.orders (customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address, pickup_distance_km, after_hours, scheduled_for, pickup_fare_kobo, notes, created_by)
  values (auth.uid(), 'online', 'awaiting_fare_payment', (_q->>'zone_id')::uuid, _lat, _lng, _a, (_q->>'distance_km')::numeric,
          coalesce((_q->>'after_hours')::boolean, false), nullif(_q->>'scheduled_for', '')::timestamptz, (_q->>'fare_kobo')::bigint, nullif(trim(_notes), ''), auth.uid())
  returning id into _id;
  return _id;
end $$;

create or replace function public.cancel_my_order(_order uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = 'cancelled' where id = _order and customer_id = auth.uid() and status = 'awaiting_fare_payment';
  if not found then raise exception 'cannot_cancel' using errcode = 'P0001'; end if;
end $$;

-- 3. Payment intent: the amount is always computed here, never taken from the phone.
create or replace function public.create_payment_intent(_order uuid, _purpose text, _provider text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _amt bigint; _paid bigint; _ref text; _mp uuid; _p public.profiles;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _provider not in ('paystack', 'flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _purpose = 'pickup_fare' then
    if _o.status <> 'awaiting_fare_payment' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    _amt := _o.pickup_fare_kobo;
  elsif _purpose = 'items' then
    if _o.status <> 'counted' or _o.source = 'subscription' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0) into _paid from public.payments where order_id = _order and purpose = 'items' and status = 'success';
    _amt := greatest(0, _o.items_total_kobo - _o.discount_kobo) - _paid;
  else
    raise exception 'invalid_purpose' using errcode = 'P0001';
  end if;
  if _amt is null or _amt <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  _mp := private.online_money_point();
  if _mp is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where order_id = _order and purpose = _purpose and status = 'pending';
  _ref := 'LP-' || _o.order_no || '-' || (case when _purpose = 'items' then 'B' else 'F' end) || '-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id)
  values (_order, auth.uid(), _purpose, 'payment', _provider, _amt, _ref, 'pending', _mp);
  select * into _p from public.profiles where id = auth.uid();
  return jsonb_build_object('reference', _ref, 'amount_kobo', _amt, 'email', _p.email, 'name', _p.full_name, 'phone', _p.phone, 'order_no', _o.order_no);
end $$;

-- Called only by the verified webhook (service role). Idempotent.
create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _pay public.payments; _o public.orders; _paid bigint;
begin
  select * into _pay from public.payments where reference = _reference for update;
  if not found or _pay.mode <> _provider then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  if _pay.status = 'success' then return jsonb_build_object('ok', true, 'already', true); end if;
  if _pay.amount_kobo <> _amount_kobo then raise exception 'amount_mismatch' using errcode = 'P0001'; end if;
  update public.payments set status = 'success', paid_at = now() where id = _pay.id;
  select * into _o from public.orders where id = _pay.order_id for update;
  if _pay.purpose = 'pickup_fare' and _o.status = 'awaiting_fare_payment' then
    update public.orders set status = 'awaiting_dispatch' where id = _o.id;
  elsif _pay.purpose = 'items' and _o.status = 'counted' then
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0) into _paid from public.payments where order_id = _o.id and purpose = 'items' and status = 'success';
    if _paid >= greatest(0, _o.items_total_kobo - _o.discount_kobo) then update public.orders set status = 'count_confirmed' where id = _o.id; end if;
  else
    insert into public.order_events (order_id, event, detail) values (_o.id, 'payment_needs_review', jsonb_build_object('reference', _reference, 'purpose', _pay.purpose, 'order_status', _o.status));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 4. Dispatch.
create or replace function public.list_agents() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone,
      'open_jobs', (select count(*) from public.orders o where o.pickup_agent_id = p.id and o.status in ('agent_assigned','agent_arrived','counted','count_confirmed'))) order by p.full_name)
    from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'delivery_agent' where p.status = 'active'), '[]'::jsonb);
end $$;

create or replace function public.assign_pickup_agent(_order uuid, _agent uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = _agent and r.role = 'delivery_agent' and p.status = 'active') then
    raise exception 'agent_invalid' using errcode = 'P0001';
  end if;
  update public.orders set pickup_agent_id = _agent, status = 'agent_assigned' where id = _order and status in ('awaiting_dispatch', 'agent_assigned');
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  insert into public.user_notifications (user_id, title, kind, order_id) values (_agent, 'New pickup assigned to you', 'job', _order);
end $$;

-- 5. Agent at the door.
create or replace function private.agent_order(_order uuid, _states public.order_status[]) returns public.orders language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.pickup_agent_id is distinct from auth.uid() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not (_o.status = any(_states)) then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  return _o;
end $$;

create or replace function public.agent_set_item(_order uuid, _item uuid, _qty integer) returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _i public.items; _cat text; _line uuid;
begin
  _o := private.agent_order(_order, array['agent_arrived']::public.order_status[]);
  if _qty is null or _qty < 0 or _qty > 200 then raise exception 'invalid_qty' using errcode = 'P0001'; end if;
  select * into _i from public.items where id = _item and active;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  select id into _line from public.order_items where order_id = _order and item_id = _item and removed_at is null;
  if _qty = 0 then
    update public.order_items set removed_at = now(), removed_by = auth.uid() where id = _line;
  elsif _line is not null then
    update public.order_items set qty = _qty where id = _line;
  else
    select name into _cat from public.item_categories where id = _i.category_id;
    insert into public.order_items (order_id, item_id, name, category_name, qty, unit_price_kobo, created_by) values (_order, _item, _i.name, _cat, _qty, _i.price_kobo, auth.uid());
  end if;
end $$;

create or replace function public.agent_submit_count(_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  _o := private.agent_order(_order, array['agent_arrived']::public.order_status[]);
  if not exists (select 1 from public.order_items where order_id = _order and removed_at is null) then raise exception 'no_items' using errcode = 'P0001'; end if;
  update public.orders set status = 'counted' where id = _order;
end $$;

-- Fix a mistake before the customer has paid anything.
create or replace function public.agent_reopen_count(_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  _o := private.agent_order(_order, array['counted']::public.order_status[]);
  if exists (select 1 from public.payments where order_id = _order and purpose = 'items' and status = 'success') then raise exception 'already_paid' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where order_id = _order and purpose = 'items' and status = 'pending';
  update public.orders set status = 'agent_arrived' where id = _order;
end $$;

-- 6. Secretary checks every line, then receives.
create or replace function public.check_order_item(_item uuid, _ok boolean, _note text) returns void language plpgsql security definer set search_path = '' as $$
declare _st public.order_status;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select o.status into _st from public.order_items i join public.orders o on o.id = i.order_id where i.id = _item and i.removed_at is null;
  if _st is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _st <> 'count_confirmed' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if not _ok and length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.order_items set check_state = case when _ok then 'ok' else 'flagged' end, check_note = nullif(trim(_note), ''), checked_by = auth.uid(), checked_at = now() where id = _item;
end $$;

create or replace function public.mark_received(_order uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.orders where id = _order and status = 'count_confirmed') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.order_items where order_id = _order and removed_at is null and check_state <> 'ok') then raise exception 'items_not_checked' using errcode = 'P0001'; end if;
  update public.orders set status = 'received' where id = _order;
end $$;

-- 7. Who did what, and how long each step took.
create or replace function public.order_timeline(_order uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _o public.orders; _steps jsonb; _t jsonb;
begin
  select * into _o from public.orders where id = _order;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not (_o.customer_id = auth.uid() or _o.pickup_agent_id = auth.uid() or _o.delivery_agent_id = auth.uid() or private.is_money_staff()) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  with first_hit as (
    select detail->>'to' as st, min(created_at) as at, (array_agg(actor_id order by created_at))[1] as actor
      from public.order_events where order_id = _order and event = 'status' group by detail->>'to'
  ), chain(ord, st, label) as (values
    (1, 'awaiting_dispatch', 'Fare paid, waiting for an agent'), (2, 'agent_assigned', 'Agent assigned'), (3, 'agent_arrived', 'Agent at the door (customer entered the code)'),
    (4, 'counted', 'Clothes counted and bill sent'), (5, 'count_confirmed', 'Customer paid the bill'), (6, 'received', 'Secretary received the clothes')
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

-- 8. Grants.
do $$
declare _f text;
begin
  foreach _f in array array['book_pickup(double precision,double precision,text,text)','cancel_my_order(uuid)','create_payment_intent(uuid,text,text)','list_agents()',
    'assign_pickup_agent(uuid,uuid)','agent_set_item(uuid,uuid,integer)','agent_submit_count(uuid)','agent_reopen_count(uuid)','check_order_item(uuid,boolean,text)',
    'mark_received(uuid)','order_timeline(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', _f);
    execute format('grant execute on function public.%s to authenticated', _f);
  end loop;
  revoke all on function public.settle_online_payment(text,text,bigint) from public, anon, authenticated;
  grant execute on function public.settle_online_payment(text,text,bigint) to service_role;
  revoke all on function private.agent_order(uuid, public.order_status[]) from public, anon, authenticated;
end $$;

-- Follow-up fixes applied after testing (NULL-safe access checks).
create or replace function public.order_timeline(_order uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
    (4, 'counted', 'Clothes counted and bill sent'), (5, 'count_confirmed', 'Customer paid the bill'), (6, 'received', 'Secretary received the clothes')
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

create or replace function public.issue_order_code(_order uuid, _step text) returns text language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _code text;
begin
  if _step not in ('arrival','count','delivery') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not coalesce(private.is_admin()
          or (_step in ('arrival','count') and _o.pickup_agent_id = auth.uid())
          or (_step = 'delivery' and _o.delivery_agent_id = auth.uid()), false) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if _step = 'arrival' and _o.status <> 'agent_assigned' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  insert into public.order_codes (order_id, step, code) values (_order, _step, private.gen_digits(4))
  on conflict (order_id, step) do nothing;
  select code into _code from public.order_codes where order_id = _order and step = _step and verified_at is null;
  return _code;
end $$;
