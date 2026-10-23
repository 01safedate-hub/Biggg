-- 18: return leg (wash -> ready -> delivery fare -> delivery agent -> delivered), failed delivery,
-- wrong-category correction with top-up or refund, refund payout.

create or replace function private.items_paid(_order uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0)
    from public.payments
   where order_id = _order and purpose = 'items' and (status = 'success' or (kind = 'refund' and status = 'pending'))
$$;

create or replace function private.items_due(_order uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0, o.items_total_kobo - o.discount_kobo) - private.items_paid(o.id) from public.orders o where o.id = _order
$$;

create or replace function private.reconcile_items(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _due bigint; _mp uuid;
begin
  select * into _o from public.orders where id = _order;
  if not found or _o.source = 'subscription' then return; end if;
  update public.payments set status = 'failed' where order_id = _order and purpose = 'items' and kind = 'refund' and status = 'pending';
  _due := private.items_due(_order);
  if _due < 0 then
    _mp := private.online_money_point();
    if _mp is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
    insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note)
    values (_order, _o.customer_id, 'items', 'refund', 'transfer', -_due, 'RF-' || _o.order_no || '-' || encode(extensions.gen_random_bytes(5), 'hex'), 'pending', _mp, 'Refund after a category correction');
  end if;
end $$;

create or replace function public.correct_order_item(_line uuid, _new_item uuid, _note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _l public.order_items; _o public.orders; _i public.items; _cat text; _due bigint;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _l from public.order_items where id = _line and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _l.order_id for update;
  if _o.status <> 'count_confirmed' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  select * into _i from public.items where id = _new_item and active;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  select name into _cat from public.item_categories where id = _i.category_id;
  update public.order_items set item_id = _i.id, name = _i.name, category_name = _cat, unit_price_kobo = _i.price_kobo,
         check_state = 'ok', check_note = 'Corrected from ' || _l.name || ' (' || coalesce(_l.category_name, '') || '): ' || trim(_note),
         checked_by = auth.uid(), checked_at = now()
   where id = _line;
  insert into public.order_events (order_id, actor_id, event, detail)
  values (_o.id, auth.uid(), 'item_corrected', jsonb_build_object('line', _line, 'from', _l.name, 'to', _i.name, 'old_price_kobo', _l.unit_price_kobo, 'new_price_kobo', _i.price_kobo, 'qty', _l.qty, 'note', trim(_note)));
  perform private.reconcile_items(_o.id);
  _due := private.items_due(_o.id);
  if _due > 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'A small top-up is needed', 'We corrected the category of one of your items. Please pay the difference in the app.', 'order_status', _o.id);
  elsif _due < 0 then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (_o.customer_id, 'You are getting money back', 'We corrected the category of one of your items. The difference will be refunded to you.', 'order_status', _o.id);
  end if;
  return jsonb_build_object('due_kobo', _due);
end $$;

create or replace function public.mark_refund_paid(_id uuid, _note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.payments set status = 'success', paid_at = now(), recorded_by = auth.uid(), note = coalesce(note, '') || ' | Paid: ' || trim(_note)
   where id = _id and kind = 'refund' and status = 'pending';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

create or replace function public.mark_received(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'count_confirmed' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if exists (select 1 from public.order_items where order_id = _order and removed_at is null and check_state <> 'ok') then raise exception 'items_not_checked' using errcode = 'P0001'; end if;
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  update public.orders set status = 'received' where id = _order;
end $$;

create or replace function public.start_washing(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update public.orders set status = 'in_house' where id = _order and status = 'received';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

create or replace function public.mark_ready(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'in_house' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  select value into _f from public.settings where key = 'fare_delivery';
  _round := greatest(1, coalesce((_f->>'round_to_kobo')::bigint, 5000));
  _min := coalesce((_f->>'min_fare_kobo')::bigint, 0);
  _fare := greatest(_min, (round(coalesce(_o.pickup_distance_km, 0) * 2 * coalesce((_f->>'rate_per_km_kobo')::numeric, 0) / _round) * _round)::bigint);
  update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
end $$;

create or replace function public.assign_delivery_agent(_order uuid, _agent uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _cust uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = _agent and r.role = 'delivery_agent' and p.status = 'active') then
    raise exception 'agent_invalid' using errcode = 'P0001';
  end if;
  update public.orders set delivery_agent_id = _agent where id = _order and status = 'out_for_delivery' returning customer_id into _cust;
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  insert into public.user_notifications (user_id, title, kind, order_id) values (_agent, 'New delivery assigned to you', 'job', _order);
  insert into public.user_notifications (user_id, title, kind, order_id) values (_cust, 'Your delivery agent is on the way', 'order_status', _order);
end $$;

create or replace function public.report_failed_delivery(_order uuid, _outcome text, _note text) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _d jsonb;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not coalesce(_o.delivery_agent_id = auth.uid() or private.is_shift_manager(), false) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _o.status <> 'out_for_delivery' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _outcome not in ('client_unavailable', 'no_answer', 'refused', 'address_issue') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  insert into public.delivery_attempts (order_id, logged_by, outcome, note) values (_order, auth.uid(), _outcome, nullif(trim(coalesce(_note, '')), ''));
  update public.orders set status = 'failed_delivery' where id = _order;
  select value into _d from public.settings where key = 'demurrage';
  insert into public.demurrage_cases (order_id, opened_by, grace_ends_at, fee_kobo, basis)
  values (_order, auth.uid(), now() + make_interval(hours => (_d->>'grace_hours')::int), (_d->>'fee_kobo')::bigint, _d->>'basis')
  on conflict (order_id) do nothing;
end $$;

create or replace function public.redispatch_delivery(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update public.orders set status = 'out_for_delivery', delivery_agent_id = null where id = _order and status = 'failed_delivery';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

create or replace function public.list_agents() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone,
      'open_jobs', (select count(*) from public.orders o where (o.pickup_agent_id = p.id and o.status in ('agent_assigned','agent_arrived','counted','count_confirmed'))
                                                           or (o.delivery_agent_id = p.id and o.status = 'out_for_delivery'))) order by p.full_name)
    from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'delivery_agent' where p.status = 'active'), '[]'::jsonb);
end $$;

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
    if _o.source = 'subscription' or _o.status not in ('counted', 'count_confirmed') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0) into _paid from public.payments where order_id = _order and purpose = 'items' and status = 'success';
    _amt := greatest(0, _o.items_total_kobo - _o.discount_kobo) - _paid;
  elsif _purpose = 'delivery_fare' then
    if _o.status not in ('ready', 'awaiting_delivery_fare') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
    _amt := _o.delivery_fare_kobo;
  else
    raise exception 'invalid_purpose' using errcode = 'P0001';
  end if;
  if _amt is null or _amt <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  _mp := private.online_money_point();
  if _mp is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  update public.payments set status = 'failed' where order_id = _order and purpose = _purpose and kind = 'payment' and status = 'pending';
  _ref := 'LP-' || _o.order_no || '-' || (case _purpose when 'items' then 'B' when 'delivery_fare' then 'D' else 'F' end) || '-' || encode(extensions.gen_random_bytes(6), 'hex');
  insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id)
  values (_order, auth.uid(), _purpose, 'payment', _provider, _amt, _ref, 'pending', _mp);
  select * into _p from public.profiles where id = auth.uid();
  return jsonb_build_object('reference', _ref, 'amount_kobo', _amt, 'email', _p.email, 'name', _p.full_name, 'phone', _p.phone, 'order_no', _o.order_no);
end $$;

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
  elsif _pay.purpose = 'items' and _o.status = 'count_confirmed' then
    insert into public.order_events (order_id, event, detail) values (_o.id, 'topup_received', jsonb_build_object('reference', _reference, 'amount_kobo', _amount_kobo));
  elsif _pay.purpose = 'delivery_fare' and _o.status in ('ready', 'awaiting_delivery_fare') then
    update public.orders set status = 'out_for_delivery' where id = _o.id;
  else
    insert into public.order_events (order_id, event, detail) values (_o.id, 'payment_needs_review', jsonb_build_object('reference', _reference, 'purpose', _pay.purpose, 'order_status', _o.status));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.order_status_event() returns trigger
language plpgsql security definer set search_path = '' as $$
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
    when 'ready' then 'Your clothes are ready. Pay the delivery fare in the app and we will bring them'
    when 'out_for_delivery' then 'Delivery fare received. We are assigning your delivery agent'
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

revoke execute on function public.correct_order_item(uuid, uuid, text), public.mark_refund_paid(uuid, text), public.start_washing(uuid), public.mark_ready(uuid),
  public.assign_delivery_agent(uuid, uuid), public.report_failed_delivery(uuid, text, text), public.redispatch_delivery(uuid) from public, anon;
grant execute on function public.correct_order_item(uuid, uuid, text), public.mark_refund_paid(uuid, text), public.start_washing(uuid), public.mark_ready(uuid),
  public.assign_delivery_agent(uuid, uuid), public.report_failed_delivery(uuid, text, text), public.redispatch_delivery(uuid) to authenticated;
