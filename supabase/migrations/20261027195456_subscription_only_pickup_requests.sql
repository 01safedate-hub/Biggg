-- Subscription-only pickup request flow.
-- Pickup requests consume one of two monthly pickup slots and never charge transport.
alter table public.subscription_pickups drop constraint if exists subscription_pickups_subscription_id_week_start_key;
create index if not exists subscription_pickups_subscription_period_idx on public.subscription_pickups (subscription_id, scheduled_for) where status not in ('missed','skipped');

create or replace function public.book_pickup(_lat double precision, _lng double precision, _address text, _notes text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  _q jsonb; _id uuid; _pickup uuid; _sub public.subscriptions; _plan public.plans;
  _a text := nullif(trim(_address), ''); _scheduled timestamptz; _count int;
  _timezone text := 'Africa/Lagos';
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _a is null or length(_a) < 5 or length(_a) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;

  select * into _sub from public.subscriptions s
   where s.customer_id = auth.uid() and s.status = 'active'
     and s.current_period_start <= now() and s.current_period_end > now()
   order by s.current_period_end desc limit 1 for update;
  if not found then raise exception 'subscription_required' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found or coalesce(_plan.pieces_per_month, 0) < 1 then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;

  _q := public.quote_pickup(_lat, _lng);
  if not coalesce((_q->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _q->>'zone_id' is null then raise exception 'service_area_unavailable' using errcode = 'P0001'; end if;

  select count(*) into _count from public.subscription_pickups sp
   where sp.subscription_id = _sub.id
     and sp.scheduled_for >= _sub.current_period_start and sp.scheduled_for < _sub.current_period_end
     and sp.status not in ('missed','skipped');
  if _count >= 2 then raise exception 'monthly_pickup_limit_reached' using errcode = 'P0001'; end if;

  select coalesce(value->>'timezone', 'Africa/Lagos') into _timezone from public.settings where key = 'business';
  _scheduled := coalesce(nullif(_q->>'scheduled_for','')::timestamptz, now());

  insert into public.orders (
    customer_id, source, status, zone_id, pickup_lat, pickup_lng, pickup_address,
    pickup_distance_km, after_hours, scheduled_for, pickup_fare_kobo,
    delivery_fare_kobo, notes, created_by
  ) values (
    auth.uid(), 'subscription', 'awaiting_dispatch', (_q->>'zone_id')::uuid,
    _lat, _lng, _a, nullif(_q->>'distance_km','')::numeric,
    coalesce((_q->>'after_hours')::boolean, false), _scheduled, 0, 0,
    nullif(trim(_notes), ''), auth.uid()
  ) returning id into _id;

  insert into public.subscription_pickups (
    subscription_id, week_start, scheduled_for, status, order_id, pieces_counted, overage_pieces, overage_kobo
  ) values (
    _sub.id, date_trunc('week', _scheduled at time zone _timezone)::date,
    _scheduled, 'scheduled', _id, 0, 0, 0
  ) returning id into _pickup;
  update public.orders set subscription_pickup_id = _pickup where id = _id;
  return _id;
end
$function$;

create or replace function public.book_pickup_scheduled(
  _lat double precision, _lng double precision, _address text, _notes text, _slot timestamp with time zone
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare _id uuid;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _slot is not null then
    perform pg_advisory_xact_lock(hashtext('slot:' || _slot::text));
    if private.slot_remaining(_slot, null) <= 0 then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
  end if;
  _id := public.book_pickup(_lat, _lng, _address, _notes);
  if _slot is not null then
    update public.orders set scheduled_for = _slot, after_hours = false where id = _id;
    update public.subscription_pickups set scheduled_for = _slot,
      week_start = date_trunc('week', _slot at time zone 'Africa/Lagos')::date where order_id = _id;
  end if;
  return _id;
end
$function$;

create or replace function private.sync_subscription_pickup_status()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.subscription_pickup_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'cancelled' then
    update public.subscription_pickups set status = 'skipped' where id = new.subscription_pickup_id;
  elsif new.status in ('agent_assigned','agent_arrived') then
    update public.subscription_pickups set status = 'dispatched' where id = new.subscription_pickup_id and status = 'scheduled';
  elsif new.status in ('counted','count_confirmed','received','in_house','ready','out_for_delivery','delivered','closed') then
    update public.subscription_pickups set status = 'collected' where id = new.subscription_pickup_id and status in ('scheduled','dispatched');
  end if;
  return new;
end
$function$;

drop trigger if exists orders_sync_subscription_pickup on public.orders;
create trigger orders_sync_subscription_pickup after update of status on public.orders
for each row execute function private.sync_subscription_pickup_status();

create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sp public.subscription_pickups; _sub public.subscriptions; _plan public.plans;
  _pieces integer; _used integer; _available integer; _overage integer; _price bigint;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription'
     or new.subscription_pickup_id is null then return new; end if;
  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;
  select coalesce(sum(qty),0)::integer into _pieces from public.order_items where order_id = new.id and removed_at is null;
  select coalesce(sum(sp.pieces_counted),0)::integer into _used from public.subscription_pickups sp
   where sp.subscription_id = _sub.id and sp.id <> _sp.id
     and sp.scheduled_for >= _sub.current_period_start and sp.scheduled_for < _sub.current_period_end
     and sp.status not in ('missed','skipped');
  _available := greatest(0, _plan.pieces_per_month - _used);
  _overage := greatest(0, _pieces - _available);
  _price := greatest(0, coalesce(_plan.overage_price_kobo,0));
  update public.subscription_pickups set pieces_counted = _pieces, overage_pieces = _overage,
    overage_kobo = _overage::bigint * _price, status = 'collected' where id = _sp.id;
  if _overage = 0 then update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted'; end if;
  return new;
end
$function$;

drop trigger if exists orders_finalize_subscription_count on public.orders;
create trigger orders_finalize_subscription_count after update of status on public.orders
for each row execute function private.finalize_subscription_pickup_count();

create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  _pay public.payments; _o public.orders; _paid bigint;
  _invoice public.subscription_invoices; _sub public.subscriptions; _pickup public.subscription_pickups;
begin
  select * into _pay from public.payments where reference = _reference for update;
  if not found or _pay.mode <> _provider then raise exception 'payment_not_found' using errcode='P0001'; end if;
  if _pay.status = 'success' then return jsonb_build_object('ok',true,'already',true); end if;
  if _pay.amount_kobo <> _amount_kobo then raise exception 'amount_mismatch' using errcode='P0001'; end if;
  update public.payments set status='success',paid_at=now() where id=_pay.id;

  if _pay.purpose in ('subscription','extra_clothes') then
    select * into _invoice from public.subscription_invoices where id=_pay.invoice_id for update;
    if not found then raise exception 'subscription_invoice_not_found' using errcode='P0001'; end if;
    select * into _sub from public.subscriptions where id=_invoice.subscription_id for update;
    if not found or _sub.customer_id <> _pay.customer_id then raise exception 'subscription_not_found' using errcode='P0001'; end if;
    update public.subscription_invoices set status='paid' where id=_invoice.id;
    if _pay.purpose = 'subscription' and _sub.status <> 'active' then
      update public.subscriptions set status='active',started_at=coalesce(started_at,now()),current_period_start=now(),
        current_period_end=now()+interval '1 month',updated_at=now() where id=_sub.id;
    elsif _pay.purpose = 'extra_clothes' then
      select * into _pickup from public.subscription_pickups where id=_invoice.subscription_pickup_id for update;
      if found and _pickup.order_id is not null and _pickup.overage_kobo > 0 then
        update public.orders set status='count_confirmed' where id=_pickup.order_id and status='counted';
      end if;
    end if;
    return jsonb_build_object('ok',true,'subscription_id',_sub.id,'activated',_pay.purpose='subscription');
  end if;

  select * into _o from public.orders where id=_pay.order_id for update;
  if _pay.purpose='pickup_fare' and _o.status='awaiting_fare_payment' then update public.orders set status='awaiting_dispatch' where id=_o.id;
  elsif _pay.purpose='items' and _o.status='counted' then
    select coalesce(sum(case when kind='payment' then amount_kobo else -amount_kobo end),0) into _paid from public.payments where order_id=_o.id and purpose='items' and status='success';
    if _paid >= greatest(0,_o.items_total_kobo-_o.discount_kobo)+_o.instant_fee_kobo then update public.orders set status='count_confirmed' where id=_o.id; end if;
  elsif _pay.purpose='items' and _o.status='count_confirmed' then
    insert into public.order_events(order_id,event,detail) values(_o.id,'topup_received',jsonb_build_object('reference',_reference,'amount_kobo',_amount_kobo));
  elsif _pay.purpose='delivery_fare' and _o.status in ('ready','awaiting_delivery_fare') then
    update public.orders set status='out_for_delivery' where id=_o.id;
  elsif _pay.purpose='demurrage' and _o.status='failed_delivery' then
    if private.demurrage_due(_o.id)=0 then
      update public.demurrage_cases set status='paid',closed_at=now() where order_id=_o.id and status in ('grace','accruing');
      insert into public.user_notifications(user_id,title,body,kind,order_id)
      values(_o.customer_id,'Storage fee paid','Thank you. We will call you to arrange your delivery.','demurrage',_o.id);
    end if;
    insert into public.order_events(order_id,event,detail) values(_o.id,'demurrage_payment',jsonb_build_object('reference',_reference,'amount_kobo',_amount_kobo));
  else
    insert into public.order_events(order_id,event,detail) values(_o.id,'payment_needs_review',jsonb_build_object('reference',_reference,'purpose',_pay.purpose,'order_status',_o.status));
  end if;
  return jsonb_build_object('ok',true);
end
$function$;

grant execute on function public.book_pickup(double precision,double precision,text,text) to authenticated;
grant execute on function public.book_pickup_scheduled(double precision,double precision,text,text,timestamp with time zone) to authenticated;
revoke execute on function public.book_pickup(double precision,double precision,text,text) from anon, public;
revoke execute on function public.book_pickup_scheduled(double precision,double precision,text,text,timestamp with time zone) from anon, public;
