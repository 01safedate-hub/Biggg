-- Commission policy, enforced in the database:
--   * an agent earns on a referred customer's orders for 12 months from when the customer joined (accepted the invite)
--   * only orders of at least ₦20,000 (laundry bill after discount) earn commission
-- Both values live in settings.commission (months, min_order_kobo). Existing commissions are not changed.

update public.settings
   set value = (value - 'min_first_order_kobo') || jsonb_build_object('months', coalesce((value->>'months')::int, 12), 'min_order_kobo', 2000000)
 where key = 'commission';

-- Patch the live refresh_order_commission in place, only if it is exactly the version that was reviewed.
do $patch$
declare
  _src text;
  _reviewed constant text := '2ed7967cc745e0439f4daab2b2a7a244';
  _vars_anchor constant text := '  _rules public.commission_rules;' || chr(10) || 'begin';
  _rate_anchor constant text := '  _rate := case when _commission_only';
  _due_anchor constant text := '  if _eligible_due = 0 or _paid_total < _eligible_due or _payment is null then return; end if;';
begin
  select prosrc into _src from pg_proc where oid = 'public.refresh_order_commission(uuid)'::regprocedure;
  if position('commission_window_months' in _src) > 0 then return; end if; -- already applied
  if md5(_src) <> _reviewed then raise exception 'refresh_order_commission changed since review; not patching'; end if;
  if (length(_src) - length(replace(_src, _vars_anchor, ''))) / length(_vars_anchor) <> 1
     or (length(_src) - length(replace(_src, _rate_anchor, ''))) / length(_rate_anchor) <> 1
     or (length(_src) - length(replace(_src, _due_anchor, ''))) / length(_due_anchor) <> 1 then
    raise exception 'patch_failed_refresh_order_commission';
  end if;

  _src := replace(_src, _vars_anchor,
    '  _rules public.commission_rules;' || chr(10) ||
    '  _cfg jsonb;' || chr(10) ||
    '  commission_window_months integer;' || chr(10) ||
    '  _min_order bigint;' || chr(10) ||
    '  _joined timestamptz;' || chr(10) ||
    'begin');

  _src := replace(_src, _rate_anchor,
    '  -- Policy: commission only within the window after the customer joined, and only on qualifying orders.' || chr(10) ||
    '  select value into _cfg from public.settings where key = ''commission'';' || chr(10) ||
    '  commission_window_months := greatest(1, coalesce((_cfg->>''months'')::int, 12));' || chr(10) ||
    '  _min_order := greatest(0, coalesce((_cfg->>''min_order_kobo'')::bigint, 2000000));' || chr(10) ||
    '  select coalesce(p.onboarded_at, p.created_at) into _joined from public.profiles p where p.id = _o.customer_id;' || chr(10) ||
    '  if _joined is null or _o.delivered_at >= _joined + make_interval(months => commission_window_months) then return; end if;' || chr(10) || chr(10) ||
    _rate_anchor);

  _src := replace(_src, _due_anchor,
    _due_anchor || chr(10) ||
    '  if _eligible_due < _min_order then return; end if;');

  execute format('create or replace function public.refresh_order_commission(_order uuid) returns void language plpgsql security definer set search_path = '''' as %L', _src);
end
$patch$;

-- Partner page terms: the real commission-only rate (commission_rules) and the enforced window and minimum.
create or replace function public.partner_programme_terms()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'commission_pct', coalesce((select round(r.commission_only_rate * 100, 2) from public.commission_rules r where r.active order by r.updated_at desc limit 1),
                               (s.value->>'commission_pct')::numeric, 10),
    'months', coalesce((s.value->>'months')::int, 12),
    'hold_hours', coalesce((s.value->>'hold_hours')::int, 48),
    'min_payout_kobo', coalesce((s.value->>'min_payout_kobo')::bigint, 100000),
    'min_order_kobo', coalesce((s.value->>'min_order_kobo')::bigint, 2000000))
  from public.settings s where s.key = 'commission'
$$;
revoke all on function public.partner_programme_terms() from public, anon;
grant execute on function public.partner_programme_terms() to authenticated;
