-- Weekly team target: weeks run Monday to Saturday (Sundays never count), and a target set during the
-- current week only counts clothes from the day it was set (counts_from).

alter table public.team_weekly_targets add column if not exists counts_from date;
update public.team_weekly_targets set counts_from = week_start where counts_from is null;

-- First day that counts for the week starting _w.
create or replace function private.team_week_counts_from(_w date)
returns date language sql stable security definer set search_path = '' as $$
  select greatest(_w, coalesce((select counts_from from public.team_weekly_targets where week_start = _w), _w))
$$;
revoke all on function private.team_week_counts_from(date) from public, anon, authenticated;

create or replace function private.team_week_units(_w date)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(sum(oi.qty), 0)::integer
    from public.order_items oi
   where oi.removed_at is null
     and oi.order_id in (
       select e.order_id from public.order_events e
        where e.event = 'status' and e.detail->>'to' = 'received'
        group by e.order_id
       having (min(e.created_at) at time zone 'Africa/Lagos')::date between private.team_week_counts_from(_w) and _w + 5
          and extract(isodow from (min(e.created_at) at time zone 'Africa/Lagos')::date) <> 7)
$function$;

create or replace function public.set_team_weekly_target(_week_start date, _units integer, _pool_kobo bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare _w date; _today date := private.today_lagos(); _this date := date_trunc('week', private.today_lagos())::date; _t public.team_weekly_targets;
        _now_units int; _n int; _s record; _edit boolean := false; _from date;
begin
  if not private.is_weekly_target_owner() then raise exception 'not_weekly_target_owner' using errcode = 'P0001'; end if;
  _w := coalesce(_week_start, _this);
  if extract(isodow from _w) <> 1 or _w not in (_this, _this + 7) then raise exception 'invalid_week' using errcode = 'P0001'; end if;
  -- Sunday is not a working day: on a Sunday only next week can be set.
  if _w = _this and extract(isodow from _today) = 7 then raise exception 'invalid_week' using errcode = 'P0001'; end if;
  if _units is null or _units < 1 or _units > 1000000 then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if _pool_kobo is null or _pool_kobo < 100 or _pool_kobo > 100000000000 then raise exception 'invalid_pool' using errcode = 'P0001'; end if;

  select * into _t from public.team_weekly_targets where week_start = _w for update;
  if found then
    if _t.status = 'hit' then raise exception 'target_already_hit' using errcode = 'P0001'; end if;
    _edit := true;
    _from := coalesce(_t.counts_from, _w);
  else
    _from := case when _w = _this then greatest(_w, _today) else _w end;
  end if;

  insert into public.team_weekly_targets (week_start, target_units, pool_kobo, set_by, counts_from)
  values (_w, _units, _pool_kobo, auth.uid(), _from)
  on conflict (week_start) do update set target_units = excluded.target_units, pool_kobo = excluded.pool_kobo,
    set_by = excluded.set_by, updated_at = now();

  _now_units := private.team_week_units(_w);
  if _units <= _now_units then raise exception 'target_already_reached' using errcode = 'P0001'; end if;

  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(_pool_kobo, _n);
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  select m.user_id, m.email, 'weekly_target_set',
         jsonb_build_object('name', m.full_name, 'week_start', _from, 'week_end', _w + 5, 'target_units', _units,
           'pool_kobo', _pool_kobo, 'members', _n, 'share_gross_kobo', _s.gross_kobo, 'share_fee_kobo', _s.running_costs_kobo,
           'share_net_kobo', _s.net_kobo, 'fee_pct', private.running_costs_pct(), 'units_so_far', _now_units, 'updated', _edit),
         'weekly-target-' || _w || '-' || m.user_id || '-' || gen_random_uuid()
    from private.team_target_members() m where m.email is not null;
  insert into public.user_notifications (user_id, title, body, kind)
  select m.user_id, case when _edit then 'This week''s team target was updated' else 'New team target for the week' end,
         'Target: ' || _units || ' clothes from ' || to_char(_from, 'FMDay DD Mon') || ' to Saturday ' || to_char(_w + 5, 'DD Mon')
           || '. Pool: ' || to_char(_pool_kobo / 100.0, 'FM999,999,999,990') || ' naira, shared equally when the team hits it.', 'weekly_target'
    from private.team_target_members() m;
  return jsonb_build_object('week_start', _w, 'counts_from', _from, 'week_end', _w + 5, 'members', _n, 'units_so_far', _now_units, 'share_net_kobo', _s.net_kobo);
end $function$;

create or replace function public.weekly_board(_week_start date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare _w date := coalesce(date_trunc('week', _week_start)::date, date_trunc('week', private.today_lagos())::date);
        _t public.team_weekly_targets; _units int; _n int; _s record;
begin
  perform private.require_super_admin();
  select * into _t from public.team_weekly_targets where week_start = _w;
  _units := private.team_week_units(_w);
  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(coalesce(_t.pool_kobo, 0), _n);
  return jsonb_build_object(
    'week_start', _w, 'counts_from', private.team_week_counts_from(_w), 'week_end', _w + 5, 'this_week', date_trunc('week', private.today_lagos())::date,
    'is_owner', private.is_weekly_target_owner(), 'fee_pct', private.running_costs_pct(),
    'units', _units,
    'target', case when _t.week_start is null then null else jsonb_build_object('units', _t.target_units, 'pool_kobo', _t.pool_kobo,
       'status', _t.status, 'hit_at', _t.hit_at, 'hit_units', _t.hit_units, 'set_at', _t.set_at, 'updated_at', _t.updated_at) end,
    'pct', case when _t.week_start is null then null else round(least(100, _units * 100.0 / _t.target_units), 1) end,
    'share', jsonb_build_object('members', _n, 'gross_kobo', _s.gross_kobo, 'fee_kobo', _s.running_costs_kobo, 'net_kobo', _s.net_kobo),
    'members', coalesce((select jsonb_agg(jsonb_build_object('staff_id', m.user_id, 'name', m.full_name, 'job_title', sp.job_title,
         'bank_name', pr.bank_name, 'account_number', pr.bank_account_number, 'account_name', pr.bank_account_name) order by m.full_name)
       from private.team_target_members() m join public.staff_pay sp on sp.user_id = m.user_id
       left join public.staff_profiles pr on pr.user_id = m.user_id), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', wp.id, 'staff_id', wp.staff_id, 'name', p.full_name,
         'gross_kobo', coalesce(wp.gross_kobo, wp.amount_kobo), 'fee_kobo', wp.running_costs_kobo, 'net_kobo', wp.amount_kobo,
         'status', wp.status, 'paid_at', wp.paid_at,
         'bank_name', pr.bank_name, 'account_number', pr.bank_account_number, 'account_name', pr.bank_account_name) order by p.full_name)
       from public.weekly_payouts wp join public.profiles p on p.id = wp.staff_id
       left join public.staff_profiles pr on pr.user_id = wp.staff_id where wp.week_start = _w), '[]'::jsonb));
end $function$;

create or replace function public.my_pay_overview()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare _u uuid := auth.uid(); _c jsonb; _unlocked boolean; _pay public.staff_pay; _first date := date_trunc('month', private.today_lagos())::date;
        _target bigint; _profit bigint; _w date := date_trunc('week', private.today_lagos())::date; _t public.team_weekly_targets;
        _units int; _n int; _s record; _member boolean;
begin
  if _u is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  _c := private.recovery_core(); _unlocked := coalesce((_c->>'capital_recovered')::boolean, false);
  select * into _pay from public.staff_pay where user_id = _u;
  _target := coalesce(_pay.monthly_target_kobo, (select nullif(value->>'monthly_net_kobo', '')::bigint from public.settings where key = 'targets'));
  _profit := private.month_profit(_first);
  select * into _t from public.team_weekly_targets where week_start = _w;
  _units := private.team_week_units(_w);
  _member := exists (select 1 from private.team_target_members() m where m.user_id = _u);
  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(coalesce(_t.pool_kobo, 0), _n);
  return jsonb_build_object(
    'has_pay', _pay.user_id is not null, 'job_title', _pay.job_title,
    'base_salary_kobo', _pay.base_salary_kobo, 'target_salary_kobo', _pay.boosted_salary_kobo,
    'unlocked', _unlocked, 'startup_pct', _c->'capital_pct',
    'month_pct', case when not _unlocked or _target is null then null else round(least(100, greatest(0, _profit)::numeric * 100 / _target), 1) end,
    'weekly_enabled', _member and _t.week_start is not null,
    'weekly_pct', case when _t.week_start is null then null else round(least(100, _units * 100.0 / _t.target_units), 1) end,
    'weekly_payout_kobo', _s.net_kobo,
    'team', case when _t.week_start is null then null else jsonb_build_object('week_start', _w, 'counts_from', private.team_week_counts_from(_w), 'week_end', _w + 5,
       'target_units', _t.target_units, 'units', _units, 'pool_kobo', _t.pool_kobo, 'members', _n, 'status', _t.status,
       'share_gross_kobo', _s.gross_kobo, 'share_fee_kobo', _s.running_costs_kobo, 'share_net_kobo', _s.net_kobo, 'member', _member) end,
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('week_start', week_start, 'amount_kobo', amount_kobo, 'status', status) order by week_start desc)
                           from (select * from public.weekly_payouts where staff_id = _u order by week_start desc limit 12) x), '[]'::jsonb));
end $function$;

-- This week's target (set on Wednesday 11 November) counts from that day.
update public.team_weekly_targets set counts_from = '2026-11-11', updated_at = now() where week_start = '2026-11-09';
