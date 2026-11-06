-- Instant delivery fee per service: dry clean 300 naira per item (fee_per_item_kobo, unchanged), iron only 200 naira per item (new fee_per_item_iron_kobo).
-- Admin edits both in Staff > Speed > Targets and instant delivery.

update public.settings
   set value = value || jsonb_build_object('fee_per_item_iron_kobo', 20000)
 where key = 'instant' and not (value ? 'fee_per_item_iron_kobo');

create or replace function private.instant_fee_for(_order uuid)
returns bigint
language sql
stable security definer
set search_path = ''
as $function$
  select coalesce(sum(oi.qty * case when oi.service = 'iron_only'
                                     then coalesce((c.v->>'fee_per_item_iron_kobo')::bigint, (c.v->>'fee_per_item_kobo')::bigint, 0)
                                     else coalesce((c.v->>'fee_per_item_kobo')::bigint, 0) end), 0)::bigint
    from public.order_items oi
    cross join (select private.instant_cfg() as v) c
   where oi.order_id = _order and oi.removed_at is null
$function$;

create or replace function public.instant_quote(_order uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  _o public.orders; _cfg jsonb := private.instant_cfg(); _n integer; _iron integer;
  _per bigint := coalesce((private.instant_cfg()->>'fee_per_item_kobo')::bigint, 0);
  _per_iron bigint := coalesce((private.instant_cfg()->>'fee_per_item_iron_kobo')::bigint, (private.instant_cfg()->>'fee_per_item_kobo')::bigint, 0);
begin
  select * into _o from public.orders where id = _order;
  if not found or not coalesce(_o.customer_id = auth.uid() or (private.is_shift_manager() and private.is_active()), false) then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  select coalesce(sum(qty), 0), coalesce(sum(qty) filter (where service = 'iron_only'), 0) into _n, _iron
    from public.order_items where order_id = _order and removed_at is null;
  return jsonb_build_object('enabled', coalesce((_cfg->>'enabled')::boolean, false), 'per_item_kobo', _per, 'per_item_iron_kobo', _per_iron,
    'items', _n, 'iron_items', _iron, 'dry_items', _n - _iron, 'fee_kobo', private.instant_fee_for(_order),
    'on', _o.instant, 'target_hours', coalesce((_cfg->>'target_hours')::int, 4),
    'large', _n > coalesce((_cfg->>'large_load_items')::int, 30), 'large_hours', coalesce((_cfg->>'large_load_hours')::int, 8));
end $function$;

create or replace function public.save_instant_settings(_enabled boolean, _fee_kobo bigint, _iron_fee_kobo bigint, _target_hours integer, _large_items integer, _large_hours integer, _pickup_target integer)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_super_admin();
  if _fee_kobo is null or _fee_kobo < 0 or _fee_kobo > 1000000 or _iron_fee_kobo is null or _iron_fee_kobo < 0 or _iron_fee_kobo > 1000000
     or _target_hours not between 1 and 24 or _large_items not between 5 and 500
     or _large_hours not between _target_hours and 48 or _pickup_target not between 5 and 240 then
    raise exception 'invalid_instant' using errcode = 'P0001';
  end if;
  update public.settings set value = jsonb_build_object('enabled', _enabled, 'fee_per_item_kobo', _fee_kobo, 'fee_per_item_iron_kobo', _iron_fee_kobo, 'target_hours', _target_hours, 'large_load_items', _large_items, 'large_load_hours', _large_hours), updated_by = auth.uid(), updated_at = now() where key = 'instant';
  update public.settings set value = jsonb_build_object('minutes', _pickup_target), updated_by = auth.uid(), updated_at = now() where key = 'pickup_target';
end $function$;

-- The older six-argument form keeps working and leaves the iron-only fee as it is.
create or replace function public.save_instant_settings(_enabled boolean, _fee_kobo bigint, _target_hours integer, _large_items integer, _large_hours integer, _pickup_target integer)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.save_instant_settings(_enabled, _fee_kobo,
    coalesce((select (value->>'fee_per_item_iron_kobo')::bigint from public.settings where key = 'instant'), _fee_kobo),
    _target_hours, _large_items, _large_hours, _pickup_target);
end $function$;

revoke execute on function public.save_instant_settings(boolean, bigint, bigint, integer, integer, integer, integer) from public, anon;
grant execute on function public.save_instant_settings(boolean, bigint, bigint, integer, integer, integer, integer) to authenticated;
