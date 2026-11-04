-- Keep excluded-category full-price charges separate from the subscription extra-piece rate.
alter table public.subscription_pickups add column if not exists excluded_kobo bigint not null default 0 check (excluded_kobo >= 0);
create or replace function private.finalize_subscription_pickup_count()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  _sp public.subscription_pickups; _sub public.subscriptions; _plan public.plans;
  _pieces integer; _used integer; _available integer; _total_overage integer;
  _excluded_pieces integer := 0; _category_overage integer := 0; _included_pieces integer := 0;
  _excluded_kobo bigint := 0;
  _overage integer; _price bigint; _line record; _category_key text;
  _category_limit integer; _category_used integer;
  _cycle_start timestamptz; _cycle_end timestamptz; _cycle_months integer;
begin
  if new.status <> 'counted' or old.status = 'counted' or new.source <> 'subscription' or new.subscription_pickup_id is null then return new; end if;
  select * into _sp from public.subscription_pickups where id = new.subscription_pickup_id for update;
  if not found then return new; end if;
  select * into _sub from public.subscriptions where id = _sp.subscription_id for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0001'; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  if not found then raise exception 'subscription_plan_invalid' using errcode = 'P0001'; end if;
  _cycle_months := greatest(0, (extract(year from age(_sp.scheduled_for, _sub.current_period_start))::integer * 12)
                                + extract(month from age(_sp.scheduled_for, _sub.current_period_start))::integer);
  _cycle_start := _sub.current_period_start + make_interval(months => _cycle_months);
  _cycle_end := _sub.current_period_start + make_interval(months => _cycle_months + 1);
  select coalesce(sum(qty),0)::integer into _pieces from public.order_items where order_id = new.id and removed_at is null;
  select coalesce(sum(greatest(coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0), 0)), 0)::integer
    into _used
    from public.subscription_pickups prior
   where prior.subscription_id = _sub.id and prior.id <> _sp.id
     and prior.scheduled_for >= _cycle_start and prior.scheduled_for < _cycle_end
     and prior.status not in ('missed','skipped');
  _available := greatest(0, least(_plan.pieces_per_month - _used, coalesce(_plan.weekly_allowance, _plan.pieces_per_month)));
  for _line in
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key, sum(oi.qty)::integer as qty
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  loop
    _category_key := _line.category_key;
    if _plan.category_limits ? _category_key then
      begin _category_limit := greatest(0, (_plan.category_limits ->> _category_key)::integer);
      exception when others then raise exception 'invalid_category_limit_for_%', _category_key using errcode = '22023'; end;
      select coalesce(sum(oi.qty),0)::integer into _category_used
        from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
       where oi.removed_at is null and lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) = _category_key
         and oi.order_id in (select prior_order.id from public.subscription_pickups prior join public.orders prior_order on prior_order.subscription_pickup_id = prior.id
          where prior.subscription_id = _sub.id and prior.id <> _sp.id and prior.scheduled_for >= _cycle_start
            and prior.scheduled_for < _cycle_end and prior.status not in ('missed','skipped'));
      if _category_limit = 0 then null;
      else _category_overage := _category_overage + greatest(0, _line.qty + _category_used - _category_limit);
           _included_pieces := _included_pieces + least(_line.qty, greatest(0, _category_limit - _category_used)); end if;
    else _included_pieces := _included_pieces + _line.qty; end if;
  end loop;
  select coalesce(sum(excluded_line.qty), 0)::integer into _excluded_pieces from (
    select lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')) as category_key, sum(oi.qty)::integer as qty
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
     where oi.order_id = new.id and oi.removed_at is null group by 1
  ) excluded_line where _plan.category_limits ? excluded_line.category_key and coalesce((_plan.category_limits ->> excluded_line.category_key)::integer, 0) = 0;
  _total_overage := greatest(0, _included_pieces - _available);
  _overage := _category_overage + _total_overage;
  _price := greatest(0, coalesce(_plan.overage_price_kobo,0));
  select coalesce(sum(oi.line_total_kobo), 0)::bigint into _excluded_kobo
    from public.order_items oi left join public.items i on i.id = oi.item_id
    left join public.item_categories ic on ic.id = i.category_id
   where oi.order_id = new.id and oi.removed_at is null
     and _plan.category_limits ? lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g'))
     and coalesce((_plan.category_limits ->> lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')))::integer, 0) = 0;
  update public.subscription_pickups set pieces_counted = _pieces, overage_pieces = _overage,
    overage_kobo = _overage::bigint * _price, excluded_kobo = _excluded_kobo, status = 'collected' where id = _sp.id;
  if _overage = 0 and _excluded_kobo = 0 then update public.orders set status = 'count_confirmed' where id = new.id and status = 'counted'; end if;
  return new;
end
$function$;
create or replace function public.create_extra_clothes_payment_intent(_pickup uuid, _provider text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  _pickup_row public.subscription_pickups; _sub public.subscriptions; _invoice public.subscription_invoices;
  _profile public.profiles; _reference text; _payment uuid; _amount bigint;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _provider not in ('paystack', 'flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _pickup_row from public.subscription_pickups where id = _pickup for update;
  if not found then raise exception 'bill_not_found' using errcode = 'P0001'; end if;
  select * into _sub from public.subscriptions where id = _pickup_row.subscription_id and customer_id = auth.uid() for update;
  if not found then raise exception 'bill_not_found' using errcode = 'P0001'; end if;
  _amount := coalesce(_pickup_row.overage_kobo,0) + coalesce(_pickup_row.excluded_kobo,0);
  if _amount <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  if private.online_money_point() is null then raise exception 'no_online_money_point' using errcode = 'P0001'; end if;
  select * into _invoice from public.subscription_invoices where subscription_pickup_id = _pickup_row.id for update;
  if found and _invoice.status = 'paid' then raise exception 'already_paid' using errcode = 'P0001'; end if;
  if not found then
    insert into public.subscription_invoices(subscription_id,subscription_pickup_id,period_start,period_end,amount_kobo,status)
    values(_sub.id,_pickup_row.id,current_date,current_date,_amount,'due') returning * into _invoice;
  else update public.subscription_invoices set amount_kobo = _amount,status='due' where id=_invoice.id; end if;
  update public.payments set status='failed' where invoice_id=_invoice.id and status='pending';
  _reference := 'LP-EXTRA-' || replace(_pickup_row.id::text,'-','') || '-' || encode(extensions.gen_random_bytes(5),'hex');
  insert into public.payments(invoice_id,customer_id,purpose,kind,mode,amount_kobo,reference,status,money_point_id,note)
  values(_invoice.id,auth.uid(),'extra_clothes','payment',_provider,_amount,_reference,'pending',private.online_money_point(),
    'Subscription pickup charges: extra pieces and excluded categories') returning id into _payment;
  update public.subscription_invoices set payment_id=_payment where id=_invoice.id;
  select * into _profile from public.profiles where id=auth.uid();
  return jsonb_build_object('reference',_reference,'amount_kobo',_amount,'email',_profile.email,'name',_profile.full_name,'phone',_profile.phone,
    'plan_name','Subscription pickup charges','subscription_id',_sub.id);
end;
$function$;
revoke execute on function public.create_extra_clothes_payment_intent(uuid,text) from public,anon;
grant execute on function public.create_extra_clothes_payment_intent(uuid,text) to authenticated;

comment on column public.subscription_pickups.excluded_kobo is 'Full catalogue-price amount for excluded-category garments; separate from the plan extra-piece rate.';

drop function if exists public.agent_subscription_pickup_summary(uuid);
create function public.agent_subscription_pickup_summary(p_order_id uuid)
returns table(pieces_counted integer, overage_pieces integer, overage_kobo bigint, excluded_kobo bigint, subscription_id uuid)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.orders o where o.id = p_order_id and o.source = 'subscription'
      and (o.pickup_agent_id = auth.uid() or o.delivery_agent_id = auth.uid())
  ) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
    select sp.pieces_counted, sp.overage_pieces, sp.overage_kobo, sp.excluded_kobo, sp.subscription_id
      from public.orders o join public.subscription_pickups sp on sp.id = o.subscription_pickup_id
     where o.id = p_order_id;
end
$function$;
revoke all on function public.agent_subscription_pickup_summary(uuid) from public, anon;
grant execute on function public.agent_subscription_pickup_summary(uuid) to authenticated;
