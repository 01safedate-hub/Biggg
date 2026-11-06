-- Subscribers can drop clothes at the hub. The desk counts them against the
-- plan (same counting and billing as a pickup) and the customer collects them
-- at the hub. A drop-off is not one of the plan's included pickups.
-- Iron only is never used on subscription orders.

alter table public.subscription_pickups add column if not exists hub_dropoff boolean not null default false;

create or replace function private.subscription_included_pickups_used(_sub uuid, _from timestamptz, _to timestamptz)
returns integer language sql stable set search_path = ''
as $$
  select count(*)::integer from public.subscription_pickups sp
   where sp.subscription_id = _sub and sp.scheduled_for >= _from and sp.scheduled_for < _to
     and sp.status not in ('missed','skipped') and not sp.transport_paid and not sp.hub_dropoff
$$;

-- The desk order helper also accepts subscription hub drop-offs.
create or replace function private.walkin_order(_order uuid, _states public.order_status[])
returns public.orders language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or not (_o.source = 'walk_in'
      or (_o.source = 'subscription' and _o.pickup_lat is null and _o.subscription_pickup_id is not null)) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if not (_o.status = any(_states)) then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  return _o;
end
$$;

create or replace function public.desk_create_subscription_dropoff(_customer uuid, _notes text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare _id uuid; _station uuid; _sub public.subscriptions; _pickup uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  perform private.roll_customer_subscriptions(_customer);
  select * into _sub from public.subscriptions s
   where s.customer_id = _customer and s.status = 'active' and s.current_period_start <= now() and s.current_period_end > now()
   order by s.current_period_end desc limit 1 for update;
  if not found then raise exception 'subscription_required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.orders o join public.subscription_pickups sp on sp.id = o.subscription_pickup_id
              where sp.subscription_id = _sub.id and sp.hub_dropoff and o.status in ('agent_arrived','counted')) then
    raise exception 'dropoff_already_open' using errcode = 'P0001';
  end if;
  select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
  if _station is null then raise exception 'staff_station_required' using errcode = 'P0001'; end if;
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo, notes, created_by, zone_id, scheduled_for)
  values (_customer, 'subscription', 'agent_arrived', 0, 0, nullif(trim(_notes), ''), auth.uid(), _station, now())
  returning id into _id;
  insert into public.subscription_pickups (subscription_id, week_start, scheduled_for, status, order_id, pieces_counted, overage_pieces, overage_kobo, hub_dropoff)
  values (_sub.id, date_trunc('week', now() at time zone 'Africa/Lagos')::date, now(), 'dispatched', _id, 0, 0, 0, true)
  returning id into _pickup;
  update public.orders set subscription_pickup_id = _pickup where id = _id;
  return _id;
end
$$;
revoke all on function public.desk_create_subscription_dropoff(uuid, text) from public, anon;
grant execute on function public.desk_create_subscription_dropoff(uuid, text) to authenticated;

-- Desk search shows each customer's live plan.
create or replace function public.desk_find_customer(_q text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _t text := trim(coalesce(_q, '')); _digits text := regexp_replace(coalesce(_q, ''), '\D', '', 'g'); _safe text;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if length(_t) < 3 then return '[]'::jsonb; end if;
  _safe := replace(replace(replace(_t, '\', ' '), '%', ' '), '_', ' ');
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'is_walk_in', p.is_walk_in,
        'orders', (select count(*) from public.orders o where o.customer_id = p.id),
        'plan', (select pl.name from public.subscriptions s join public.plans pl on pl.id = s.plan_id
                  where s.customer_id = p.id and s.status = 'active' and s.current_period_end > now()
                  order by s.current_period_end desc limit 1)) x
      from public.profiles p
     where not exists (select 1 from public.user_roles r where r.user_id = p.id)
       and ((length(_digits) >= 4 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || _digits || '%')
            or p.full_name ilike '%' || _safe || '%')
     order by p.full_name limit 8) s), '[]'::jsonb);
end
$$;

-- Desk payment: for a plan drop-off it collects the extras bill (pieces above
-- the allowance and items the plan does not cover), not the full catalogue bill.
create or replace function public.desk_record_payment(_order uuid, _mode text, _money_point uuid, _note text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _o public.orders; _due bigint; _ref text; _sp public.subscription_pickups; _inv public.subscription_invoices; _pay uuid;
begin
  _o := private.walkin_order(_order, array['counted']::public.order_status[]);
  if _mode not in ('cash', 'transfer', 'pos') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.money_points where id = _money_point and active and kind <> 'online') then raise exception 'money_point_required' using errcode = 'P0001'; end if;
  if _mode <> 'cash' and length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if _o.source = 'subscription' then
    select * into _sp from public.subscription_pickups where id = _o.subscription_pickup_id for update;
    _due := coalesce(_sp.overage_kobo, 0) + coalesce(_sp.excluded_kobo, 0);
    if _due <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
    select * into _inv from public.subscription_invoices where subscription_pickup_id = _sp.id for update;
    if found and _inv.status = 'paid' then raise exception 'already_paid' using errcode = 'P0001'; end if;
    if not found then
      insert into public.subscription_invoices (subscription_id, subscription_pickup_id, period_start, period_end, amount_kobo, status)
      values (_sp.subscription_id, _sp.id, current_date, current_date, _due, 'paid') returning * into _inv;
    else
      update public.subscription_invoices set amount_kobo = _due, status = 'paid' where id = _inv.id;
      update public.payments set status = 'failed' where invoice_id = _inv.id and status = 'pending';
    end if;
    _ref := 'WI-' || _o.order_no || '-X-' || encode(extensions.gen_random_bytes(4), 'hex');
    insert into public.payments (invoice_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by)
    values (_inv.id, _o.customer_id, 'extra_clothes', 'payment', _mode, _due, _ref, 'success', _money_point, nullif(trim(coalesce(_note, '')), ''), auth.uid())
    returning id into _pay;
    update public.subscription_invoices set payment_id = _pay where id = _inv.id;
  else
    _due := private.items_due(_order);
    if _due <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
    _ref := 'WI-' || _o.order_no || '-' || encode(extensions.gen_random_bytes(4), 'hex');
    insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by)
    values (_order, _o.customer_id, 'items', 'payment', _mode, _due, _ref, 'success', _money_point, nullif(trim(coalesce(_note, '')), ''), auth.uid());
  end if;
  update public.order_items set check_state = 'ok', check_note = 'Counted in front of the customer at the desk' where order_id = _order and removed_at is null;
  update public.orders set status = 'count_confirmed' where id = _order;
  return jsonb_build_object('reference', _ref, 'amount_kobo', _due);
end
$$;

create or replace function public.desk_handover(_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  _o := private.walkin_order(_order, array['ready']::public.order_status[]);
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  update public.orders set status = 'delivered', delivered_at = now() where id = _order;
end
$$;

create or replace function public.desk_walkin_recent()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', o.id, 'order_no', o.order_no, 'status', o.status, 'customer', c.full_name, 'phone', c.phone,
        'total_kobo', case when o.source = 'subscription' then coalesce(sp.overage_kobo, 0) + coalesce(sp.excluded_kobo, 0)
                           else greatest(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo end,
        'created_at', o.created_at, 'instant', o.instant, 'zone_id', o.zone_id, 'hub_name', z.name,
        'created_by', o.created_by, 'created_by_name', creator.full_name,
        'plan', case when o.source = 'subscription' then pl.name end
      ) x
      from public.orders o
      join public.profiles c on c.id = o.customer_id
      left join public.zones z on z.id = o.zone_id
      left join public.profiles creator on creator.id = o.created_by
      left join public.subscription_pickups sp on sp.id = o.subscription_pickup_id
      left join public.subscriptions s on s.id = sp.subscription_id
      left join public.plans pl on pl.id = s.plan_id
      where (o.source = 'walk_in' or (o.source = 'subscription' and o.pickup_lat is null and o.subscription_pickup_id is not null))
        and (o.created_at > now() - interval '3 days' or o.status not in ('delivered', 'closed', 'cancelled'))
      order by o.created_at desc
      limit 200
    ) s
  ), '[]'::jsonb);
end
$$;

-- No iron only on plan orders (desk and agent).
do $$
declare _fn text; _src text; _args text;
begin
  foreach _fn in array array['desk_set_item','agent_set_item'] loop
    _args := '_order uuid, _item uuid, _qty integer, _service text';
    select p.prosrc into _src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = _fn and pg_get_function_identity_arguments(p.oid) = _args;
    continue when _src is null or position('iron_only_not_on_plan' in _src) > 0;
    _src := replace(_src,
      '  if _svc not in (''dry_clean'',''iron_only'') then raise exception ''invalid_service'' using errcode = ''P0001''; end if;',
      '  if _svc not in (''dry_clean'',''iron_only'') then raise exception ''invalid_service'' using errcode = ''P0001''; end if;' || chr(10) ||
      '  if _svc = ''iron_only'' and _qty > 0 and _o.source = ''subscription'' then raise exception ''iron_only_not_on_plan'' using errcode = ''P0001''; end if;');
    if position('iron_only_not_on_plan' in _src) = 0 then raise exception 'patch_failed_%', _fn; end if;
    execute format('create or replace function public.%I(%s) returns void language plpgsql security definer set search_path = '''' as %L', _fn, _args, _src);
  end loop;
end $$;

-- Call-list follow-up for the next pickup only makes sense on plans with
-- included pickups left in the cycle.
create or replace function public.create_subscription_pickup_followup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _sub public.subscriptions; _plan public.plans; _next timestamptz; _cycle record;
begin
  if new.status <> 'collected' or old.status is not distinct from new.status then return new; end if;
  select * into _sub from public.subscriptions where id = new.subscription_id;
  if not found or _sub.status <> 'active' then return new; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  select * into _cycle from private.subscription_cycle(_sub.current_period_start, new.scheduled_for);
  if coalesce(_plan.pickups_per_month, 0) <= private.subscription_included_pickups_used(_sub.id, _cycle.cycle_start, _cycle.cycle_end) then
    return new;
  end if;
  _next := new.scheduled_for + interval '14 days';
  if _next <= now() then _next := now() + interval '1 day'; end if;
  if _next >= _sub.current_period_end then return new; end if;
  insert into public.subscription_pickup_followups (subscription_id, customer_id, first_pickup_id, scheduled_for)
  values (_sub.id, _sub.customer_id, new.id, _next)
  on conflict (first_pickup_id) do nothing;
  return new;
end
$$;

-- WhatsApp assistant snapshot: real included-pickup numbers per plan, student
-- review state, and the paid next term. overage_price_kobo is no longer used.
create or replace function public.whatsapp_subscription_snapshot(_customer uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_sub public.subscriptions; v_plan public.plans; v_cycle_start timestamptz; v_cycle_end timestamptz; v_pickups integer := 0; v_pieces integer := 0;
  v_last timestamptz; v_invoices jsonb; v_next public.subscription_invoices; v_next_plan text;
begin
  if not exists (select 1 from public.whatsapp_account_verifications where customer_id = _customer and verified_until > now()) then
    raise exception 'whatsapp_identity_not_verified' using errcode = 'P0001';
  end if;
  perform private.roll_customer_subscriptions(_customer);
  select * into v_sub from public.subscriptions
   where customer_id = _customer and status in ('active','pending_review','expired','pending')
   order by case status when 'active' then 0 when 'pending_review' then 1 when 'pending' then 2 else 3 end,
            current_period_end desc nulls last, created_at desc limit 1;
  if not found then return jsonb_build_object('has_subscription', false); end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_sub.status = 'active' and v_sub.current_period_start is not null then
    select c.cycle_start, c.cycle_end into v_cycle_start, v_cycle_end from private.subscription_cycle(v_sub.current_period_start, now()) c;
    v_pickups := private.subscription_included_pickups_used(v_sub.id, v_cycle_start, v_cycle_end);
    select coalesce(sum(greatest(0, coalesce(sp.pieces_counted,0) - coalesce(sp.overage_pieces,0) - coalesce(sp.excluded_pieces,0))),0)::int,
           max(sp.scheduled_for)
      into v_pieces, v_last
      from public.subscription_pickups sp
     where sp.subscription_id = v_sub.id and sp.scheduled_for >= v_cycle_start and sp.scheduled_for < v_cycle_end
       and sp.status not in ('missed','skipped');
    select * into v_next from public.subscription_invoices i
     where i.subscription_id = v_sub.id and i.subscription_pickup_id is null and i.status in ('due','paid')
       and i.period_start = (v_sub.current_period_end at time zone 'Africa/Lagos')::date
     order by (i.status = 'paid') desc, i.created_at desc limit 1;
    if v_next.id is not null then select name into v_next_plan from public.plans where id = coalesce(v_next.plan_id, v_sub.plan_id); end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'period_start', i.period_start, 'period_end', i.period_end,
      'amount_kobo', i.amount_kobo, 'status', i.status, 'payment_status', p.status,
      'payment_reference', p.reference, 'paid_at', p.paid_at
    ) order by i.created_at desc), '[]'::jsonb)
    into v_invoices
    from (select * from public.subscription_invoices
          where subscription_id = v_sub.id and subscription_pickup_id is null
          order by created_at desc limit 6) i
    left join public.payments p on p.id = i.payment_id;
  return jsonb_build_object(
    'has_subscription', true,
    'subscription', jsonb_build_object('id', v_sub.id, 'status', v_sub.status, 'billing_period', v_sub.billing_period,
      'current_period_start', v_sub.current_period_start, 'current_period_end', v_sub.current_period_end,
      'cancel_at_period_end', v_sub.cancel_at_period_end, 'price_kobo', v_sub.price_kobo, 'term_amount_kobo', v_sub.term_amount_kobo,
      'waiting_for_student_id_check', v_sub.status = 'pending_review'),
    'plan', jsonb_build_object('name', v_plan.name, 'slug', v_plan.slug, 'pieces_per_month', v_plan.pieces_per_month,
      'per_pickup_cap', v_plan.weekly_allowance, 'free_pickups_per_month', v_plan.pickups_per_month,
      'student_plan', v_plan.requires_student_id, 'category_limits', v_plan.category_limits,
      'extra_pieces_rule', 'Pieces above the allowance or a category limit, and items the plan does not cover, are billed at the normal item price.'),
    'cycle', jsonb_build_object('start', v_cycle_start, 'end', v_cycle_end),
    'usage', jsonb_build_object('pickups_used', v_pickups, 'pickups_included', v_plan.pickups_per_month,
      'garments_used', v_pieces, 'garments_included', v_plan.pieces_per_month, 'last_pickup_at', v_last,
      'extra_pickups_rule', 'After the free pickups, more pickups can be booked with paid transport, or clothes can be dropped at the hub for free. Unused pieces and pickups do not carry over.'),
    'next_term', case when v_next.id is null then null else jsonb_build_object('status', v_next.status, 'plan', v_next_plan,
      'starts_on', v_next.period_start, 'amount_kobo', v_next.amount_kobo) end,
    'invoices', v_invoices);
end
$$;
