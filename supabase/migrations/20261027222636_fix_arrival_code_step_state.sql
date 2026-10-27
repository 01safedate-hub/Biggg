CREATE OR REPLACE FUNCTION public.issue_order_code(_order uuid, _step text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _o public.orders;
  _code text;
begin
  if _step not in ('arrival','count','delivery') then
    raise exception 'invalid_step' using errcode = 'P0001';
  end if;

  select * into _o from public.orders where id = _order;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not coalesce(
    private.is_admin()
    or (_step in ('arrival','count') and _o.pickup_agent_id = auth.uid())
    or (_step = 'delivery' and _o.delivery_agent_id = auth.uid()),
    false
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if _step = 'arrival' and _o.status <> 'agent_assigned' then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;
  if _step = 'count' and _o.status <> 'counted' then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;
  if _step = 'delivery' and not (
    _o.status = 'out_for_delivery'
    or (_o.source = 'walk_in' and _o.status = 'ready')
  ) then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;

  insert into public.order_codes (order_id, step, code)
  values (_order, _step, private.gen_digits(4))
  on conflict (order_id, step) do nothing;

  select code into _code
  from public.order_codes
  where order_id = _order and step = _step and verified_at is null;

  if _code is null then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  return _code;
end
$function$
;

CREATE OR REPLACE FUNCTION public.verify_order_code(_order uuid, _step text, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _o public.orders;
  _row public.order_codes;
  _to public.order_status;
  _paid bigint;
begin
  select * into _o from public.orders where id = _order for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if _o.customer_id = auth.uid() then
    if not private.is_active() then
      raise exception 'account_restricted' using errcode = 'P0001';
    end if;
  elsif not (_o.source = 'walk_in' and private.is_money_staff()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if _step = 'arrival' then
    if _o.status <> 'agent_assigned' then
      raise exception 'wrong_state' using errcode = 'P0001';
    end if;
    _to := 'agent_arrived';
  elsif _step = 'count' then
    if _o.status <> 'counted' then
      raise exception 'wrong_state' using errcode = 'P0001';
    end if;
    select coalesce(sum(case when kind = 'payment' then amount_kobo else -amount_kobo end), 0)
      into _paid
    from public.payments
    where order_id = _order and purpose = 'items' and status = 'success';
    if _o.source <> 'subscription'
       and _paid < (greatest(0, _o.items_total_kobo - _o.discount_kobo) + _o.instant_fee_kobo) then
      raise exception 'payment_required' using errcode = 'P0001';
    end if;
    _to := 'count_confirmed';
  elsif _step = 'delivery' then
    if not (_o.status = 'out_for_delivery' or (_o.source = 'walk_in' and _o.status = 'ready')) then
      raise exception 'wrong_state' using errcode = 'P0001';
    end if;
    _to := 'delivered';
  else
    raise exception 'invalid_step' using errcode = 'P0001';
  end if;

  select * into _row
  from public.order_codes
  where order_id = _order and step = _step
  for update;
  if not found then
    raise exception 'code_not_issued' using errcode = 'P0001';
  end if;

  if _row.verified_at is not null then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  if _row.attempts >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  if _row.code <> _code then
    update public.order_codes set attempts = attempts + 1
    where order_id = _order and step = _step;
    return jsonb_build_object('ok', false, 'attempts_left', greatest(0, 4 - _row.attempts));
  end if;

  update public.order_codes
  set verified_at = now(), verified_by = auth.uid()
  where order_id = _order and step = _step;

  update public.orders
  set status = _to,
      delivered_at = case when _to = 'delivered' then now() else delivered_at end
  where id = _order;

  return jsonb_build_object('ok', true, 'status', _to);
end
$function$
;

revoke execute on function public.issue_order_code(uuid,text) from public, anon;
grant execute on function public.issue_order_code(uuid,text) to authenticated;
revoke execute on function public.verify_order_code(uuid,text,text) from public, anon;
grant execute on function public.verify_order_code(uuid,text,text) to authenticated;
