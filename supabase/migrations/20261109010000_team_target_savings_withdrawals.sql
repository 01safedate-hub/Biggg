-- Three pay features, agreed with the owner on 9 Nov 2026:
--   1. Weekly TEAM target: one target per week for everyone with "weekly target" switched on. Units are counted
--      automatically (every item that enters the wash queue). When the team reaches it, the pool is shared equally,
--      10% of each share is kept for running costs. Starts immediately (no start-up capital lock). Only the owner
--      account can set it. Members are emailed when it is set or changed, and again when it is hit.
--   2. Referral commission: nothing is earned on orders delivered before the start-up capital is recovered.
--      Agents request withdrawals themselves; 10% of every withdrawal is kept for running costs.
--   3. Savings: 10% of salary by default, staff can raise it to 15% or 20% and never lower it. The super admin
--      confirms each month's salaries. Savings are paid out at the end of a resignation notice (at least two
--      months) or straight away after a dismissal.

-- ---------------------------------------------------------------- shared
insert into public.settings (key, value, description) values
  ('running_costs', '{"pct": 10}', 'Share kept for running costs and expenses from commission withdrawals and weekly team shares.')
on conflict (key) do nothing;

create or replace function private.running_costs_pct() returns numeric
language sql stable security definer set search_path = '' as $$
  select least(50, greatest(0, coalesce((select (value->>'pct')::numeric from public.settings where key = 'running_costs'), 10)))
$$;

-- Kept running-cost share of an amount (rounded to the nearest kobo).
create or replace function private.running_costs_of(_kobo bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select round(_kobo * private.running_costs_pct() / 100)::bigint
$$;

-- ================================================================ 1. WEEKLY TEAM TARGET
-- The only account allowed to set the weekly target (looked up by email, stored as an id).
insert into public.settings (key, value, description)
select 'weekly_target_owner', jsonb_build_object('user_id', u.id), 'The one account allowed to set the weekly team target.'
  from auth.users u where lower(u.email) = 'nnebedum50@gmail.com'
on conflict (key) do nothing;

create or replace function private.is_weekly_target_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_active() and private.is_super_admin()
     and auth.uid() = (select nullif(value->>'user_id', '')::uuid from public.settings where key = 'weekly_target_owner')
$$;

create table if not exists public.team_weekly_targets (
  week_start date primary key check (extract(isodow from week_start) = 1),
  target_units integer not null check (target_units between 1 and 1000000),
  pool_kobo bigint not null check (pool_kobo between 100 and 100000000000),
  status text not null default 'open' check (status in ('open', 'hit')),
  hit_at timestamptz,
  hit_units integer,
  set_by uuid references auth.users (id),
  set_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_weekly_targets enable row level security;
-- No policies: read and written only through the functions below.

alter table public.weekly_payouts add column if not exists gross_kobo bigint;
alter table public.weekly_payouts add column if not exists running_costs_kobo bigint not null default 0;

-- Everyone who shares the weekly pool right now.
create or replace function private.team_target_members()
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = '' as $$
  select sp.user_id, p.full_name, p.email
    from public.staff_pay sp join public.profiles p on p.id = sp.user_id
   where sp.active and sp.earns_weekly_bonus and p.status = 'active'
$$;

-- Team units for a week: every item (not removed) in orders that first reached the wash queue that week (Lagos time).
create or replace function private.team_week_units(_w date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(oi.qty), 0)::integer
    from public.order_items oi
   where oi.removed_at is null
     and oi.order_id in (
       select e.order_id from public.order_events e
        where e.event = 'status' and e.detail->>'to' = 'received'
        group by e.order_id
       having (min(e.created_at) at time zone 'Africa/Lagos')::date between _w and _w + 6)
$$;

-- Equal share of a pool among _n people, and the running-cost cut from each share.
create or replace function private.team_share(_pool bigint, _n integer)
returns table (gross_kobo bigint, running_costs_kobo bigint, net_kobo bigint)
language sql stable security definer set search_path = '' as $$
  select g, private.running_costs_of(g), g - private.running_costs_of(g)
    from (select case when coalesce(_n, 0) > 0 then floor(_pool::numeric / _n)::bigint else 0 end as g) x
$$;

-- Set or change this week's (or next week's) team target. Only the owner account. Emails every member.
create or replace function public.set_team_weekly_target(_week_start date, _units integer, _pool_kobo bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _w date; _this date := date_trunc('week', private.today_lagos())::date; _t public.team_weekly_targets;
        _now_units int; _n int; _s record; _edit boolean := false;
begin
  if not private.is_weekly_target_owner() then raise exception 'not_weekly_target_owner' using errcode = 'P0001'; end if;
  _w := coalesce(_week_start, _this);
  if extract(isodow from _w) <> 1 or _w not in (_this, _this + 7) then raise exception 'invalid_week' using errcode = 'P0001'; end if;
  if _units is null or _units < 1 or _units > 1000000 then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if _pool_kobo is null or _pool_kobo < 100 or _pool_kobo > 100000000000 then raise exception 'invalid_pool' using errcode = 'P0001'; end if;

  select * into _t from public.team_weekly_targets where week_start = _w for update;
  if found then
    if _t.status = 'hit' then raise exception 'target_already_hit' using errcode = 'P0001'; end if;
    _edit := true;
  end if;
  _now_units := private.team_week_units(_w);
  if _units <= _now_units then raise exception 'target_already_reached' using errcode = 'P0001'; end if;

  insert into public.team_weekly_targets (week_start, target_units, pool_kobo, set_by)
  values (_w, _units, _pool_kobo, auth.uid())
  on conflict (week_start) do update set target_units = excluded.target_units, pool_kobo = excluded.pool_kobo,
    set_by = excluded.set_by, updated_at = now();

  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(_pool_kobo, _n);
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  select m.user_id, m.email, 'weekly_target_set',
         jsonb_build_object('name', m.full_name, 'week_start', _w, 'week_end', _w + 6, 'target_units', _units,
           'pool_kobo', _pool_kobo, 'members', _n, 'share_gross_kobo', _s.gross_kobo, 'share_fee_kobo', _s.running_costs_kobo,
           'share_net_kobo', _s.net_kobo, 'fee_pct', private.running_costs_pct(), 'units_so_far', _now_units, 'updated', _edit),
         'weekly-target-' || _w || '-' || m.user_id || '-' || gen_random_uuid()
    from private.team_target_members() m where m.email is not null;
  insert into public.user_notifications (user_id, title, body, kind)
  select m.user_id, case when _edit then 'This week''s team target was updated' else 'New team target for the week' end,
         'Target: ' || _units || ' clothes. Pool: ' || to_char(_pool_kobo / 100.0, 'FM999,999,999,990') || ' naira, shared equally when the team hits it.', 'weekly_target'
    from private.team_target_members() m;
  return jsonb_build_object('week_start', _w, 'members', _n, 'units_so_far', _now_units, 'share_net_kobo', _s.net_kobo);
end $$;

-- Marks the week hit, creates everyone's share and emails them. Safe to call any time.
create or replace function private.team_target_check(_w date) returns boolean
language plpgsql security definer set search_path = '' as $$
declare _t public.team_weekly_targets; _units int; _n int; _s record;
begin
  select * into _t from public.team_weekly_targets where week_start = _w for update;
  if not found or _t.status <> 'open' then return false; end if;
  _units := private.team_week_units(_w);
  if _units < _t.target_units then return false; end if;

  update public.team_weekly_targets set status = 'hit', hit_at = now(), hit_units = _units, updated_at = now() where week_start = _w;
  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(_t.pool_kobo, _n);
  if _n > 0 and _s.net_kobo > 0 then
    insert into public.weekly_payouts (staff_id, week_start, units, target_units, amount_kobo, gross_kobo, running_costs_kobo, created_by)
    select m.user_id, _w, _units, _t.target_units, _s.net_kobo, _s.gross_kobo, _s.running_costs_kobo, auth.uid()
      from private.team_target_members() m
    on conflict (staff_id, week_start) do nothing;
    insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
    select m.user_id, m.email, 'weekly_target_hit',
           jsonb_build_object('name', m.full_name, 'week_start', _w, 'target_units', _t.target_units, 'units', _units,
             'pool_kobo', _t.pool_kobo, 'members', _n, 'share_gross_kobo', _s.gross_kobo, 'share_fee_kobo', _s.running_costs_kobo,
             'share_net_kobo', _s.net_kobo, 'fee_pct', private.running_costs_pct()),
           'weekly-target-hit-' || _w || '-' || m.user_id
      from private.team_target_members() m where m.email is not null
    on conflict (idempotency_key) do nothing;
    insert into public.user_notifications (user_id, title, body, kind)
    select m.user_id, 'Team target hit!', 'The team washed ' || _units || ' clothes this week. Your share: '
           || to_char(_s.net_kobo / 100.0, 'FM999,999,999,990.00') || ' naira.', 'weekly_target'
      from private.team_target_members() m;
  end if;
  return true;
end $$;

-- Every time an order enters the wash queue, check this week's team target.
-- Named zzz_ so it runs after the status event (which the unit count reads) and after the desk auto-receive trigger.
create or replace function private.orders_team_target_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Never let the bonus check block receiving clothes: on any error, log it and carry on.
  begin
    perform private.team_target_check(date_trunc('week', private.today_lagos())::date);
  exception when others then
    raise warning 'team_target_check failed: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists zzz_orders_team_target on public.orders;
create trigger zzz_orders_team_target
  after update of status on public.orders
  for each row when (new.status = 'received' and old.status is distinct from new.status)
  execute function private.orders_team_target_check();

-- Admin board (super admins): target, live units, members with bank details, payouts.
create or replace function public.weekly_board(_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _w date := coalesce(date_trunc('week', _week_start)::date, date_trunc('week', private.today_lagos())::date);
        _t public.team_weekly_targets; _units int; _n int; _s record;
begin
  perform private.require_super_admin();
  select * into _t from public.team_weekly_targets where week_start = _w;
  _units := private.team_week_units(_w);
  select count(*)::int into _n from private.team_target_members();
  select * into _s from private.team_share(coalesce(_t.pool_kobo, 0), _n);
  return jsonb_build_object(
    'week_start', _w, 'week_end', _w + 6, 'this_week', date_trunc('week', private.today_lagos())::date,
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
end $$;

-- Staff home: pay overview, now with the team target instead of personal units.
create or replace function public.my_pay_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
    'team', case when _t.week_start is null then null else jsonb_build_object('week_start', _w, 'week_end', _w + 6,
       'target_units', _t.target_units, 'units', _units, 'pool_kobo', _t.pool_kobo, 'members', _n, 'status', _t.status,
       'share_gross_kobo', _s.gross_kobo, 'share_fee_kobo', _s.running_costs_kobo, 'share_net_kobo', _s.net_kobo, 'member', _member) end,
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('week_start', week_start, 'amount_kobo', amount_kobo, 'status', status) order by week_start desc)
                           from (select * from public.weekly_payouts where staff_id = _u order by week_start desc limit 12) x), '[]'::jsonb));
end $$;

-- The old per-person, typed-in units scheme is retired. (Functions kept but no longer callable from the app.)
revoke execute on function public.log_units(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.void_units(uuid, text) from public, anon, authenticated;
revoke execute on function public.close_week(date) from public, anon, authenticated;
revoke execute on function public.set_weekly_bonus(integer, bigint) from public, anon, authenticated;

revoke all on function public.set_team_weekly_target(date, integer, bigint) from public, anon;
grant execute on function public.set_team_weekly_target(date, integer, bigint) to authenticated;
revoke all on function private.team_target_check(date) from public, anon, authenticated;
revoke all on function private.orders_team_target_check() from public, anon, authenticated;

-- ================================================================ 2. REFERRAL COMMISSION
-- When the start-up capital was first fully recovered. Recorded once, the first time it is seen; never moves.
create or replace function private.capital_recovered_at() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare _at timestamptz;
begin
  select nullif(value->>'at', '')::timestamptz into _at from public.settings where key = 'capital_recovered';
  if _at is not null then return _at; end if;
  if not private.unlocked() then return null; end if;
  insert into public.settings (key, value, description)
  values ('capital_recovered', jsonb_build_object('at', now()), 'When the start-up capital was first fully recovered. Referral commission starts from here.')
  on conflict (key) do update set value = excluded.value where nullif(public.settings.value->>'at', '') is null;
  select nullif(value->>'at', '')::timestamptz into _at from public.settings where key = 'capital_recovered';
  return _at;
end $$;
revoke all on function private.capital_recovered_at() from public, anon, authenticated;

create or replace function public.refresh_order_commission(_order uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  _o public.orders;
  _agent uuid;
  _commission_only boolean;
  _rate numeric(5,4);
  _paid_total bigint;
  _eligible_due bigint;
  _payment uuid;
  _sequence integer;
  _rules public.commission_rules;
  _cfg jsonb;
  commission_window_months integer;
  _min_order bigint;
  _joined timestamptz;
  _recovered_at timestamptz;
begin
  select * into _o from public.orders where id = _order;
  if not found or _o.delivered_at is null then return; end if;

  -- Policy: nothing is earned until the start-up capital is recovered; orders delivered before then never earn.
  _recovered_at := private.capital_recovered_at();
  if _recovered_at is null or _o.delivered_at < _recovered_at then return; end if;

  select p.onboarded_by into _agent
  from public.profiles p where p.id = _o.customer_id;
  if _agent is null then return; end if;

  _commission_only := exists (
    select 1 from public.user_roles
    where user_id = _agent and role = 'commission_agent'
  );

  if _commission_only then
    if exists (select 1 from public.staff_pay where user_id = _agent and active) then return; end if;
  else
    if not exists (
      select 1 from public.user_roles
      where user_id = _agent and role = 'delivery_agent'
    ) or not exists (
      select 1 from public.staff_pay where user_id = _agent and active
    ) then return; end if;
  end if;

  if not exists (
    select 1 from public.staff_profiles
    where user_id = _agent and onboarding_status = 'verified'
  ) or not exists (
    select 1
    from public.staff_hub_verifications h
    where h.user_id = _agent
      and h.outcome = 'passed'
      and h.person_present
      and h.nin_document_checked
      and h.nin_matches_profile
      and h.photo_matches_person
      and not exists (
        select 1
        from public.staff_hub_verifications later
        where later.user_id = h.user_id
          and later.verified_at > h.verified_at
          and later.outcome = 'rejected'
      )
  ) then return; end if;

  select * into _rules
  from public.commission_rules
  where active
  order by updated_at desc
  limit 1;
  if not found then return; end if;

  -- Policy: commission only within the window after the customer joined, and only on qualifying orders.
  select value into _cfg from public.settings where key = 'commission';
  commission_window_months := greatest(1, coalesce((_cfg->>'months')::int, 12));
  _min_order := greatest(0, coalesce((_cfg->>'min_order_kobo')::bigint, 2000000));
  select coalesce(p.onboarded_at, p.created_at) into _joined from public.profiles p where p.id = _o.customer_id;
  if _joined is null or _o.delivered_at >= _joined + make_interval(months => commission_window_months) then return; end if;

  _rate := case when _commission_only
    then _rules.commission_only_rate
    else _rules.staff_rate
  end;

  select
    coalesce(sum(p.amount_kobo), 0),
    (array_agg(p.id order by p.paid_at nulls last, p.created_at))[1]
  into _paid_total, _payment
  from public.payments p
  where p.order_id = _order
    and p.status = 'success'
    and p.kind = 'payment'
    and p.purpose in ('items', 'extra_clothes');

  _eligible_due := greatest(coalesce(_o.items_total_kobo, 0) - coalesce(_o.discount_kobo, 0), 0);
  if _eligible_due = 0 or _paid_total < _eligible_due or _payment is null then return; end if;
  if _eligible_due < _min_order then return; end if;

  if exists (
    select 1 from public.commissions
    where order_id = _order and status not in ('reversed', 'rejected')
  ) then
    update public.commissions
    set rate = _rate,
        basis_kobo = _paid_total,
        amount_kobo = round(_paid_total * _rate)::bigint,
        delivered_at = _o.delivered_at,
        release_at = _o.delivered_at + interval '48 hours',
        updated_at = now()
    where order_id = _order
      and status = 'pending'
      and payout_id is null;
    return;
  end if;

  select count(distinct old.order_id)::integer + 1
  into _sequence
  from public.commissions old
  where old.customer_id = _o.customer_id
    and old.status not in ('reversed', 'rejected');

  insert into public.commissions(
    agent_id, customer_id, order_id, payment_id, order_sequence,
    rate, basis_kobo, amount_kobo, status, delivered_at, release_at
  )
  values (
    _agent, _o.customer_id, _order, _payment, _sequence,
    _rate, _paid_total, round(_paid_total * _rate)::bigint,
    'pending', _o.delivered_at, _o.delivered_at + interval '48 hours'
  )
  on conflict do nothing;
end
$function$;

alter table public.commission_payouts add column if not exists gross_kobo bigint;
alter table public.commission_payouts add column if not exists running_costs_kobo bigint not null default 0;
alter table public.commission_payouts add column if not exists requested_by uuid references auth.users (id);
update public.commission_payouts set gross_kobo = amount_kobo where gross_kobo is null;

-- Can this agent be paid? Same checks as before: verified, passed the hub check, bank name matches their own name.
create or replace function private.agent_bank_ok(_agent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_profiles sp join public.profiles p on p.id = sp.user_id
     where sp.user_id = _agent and sp.onboarding_status = 'verified'
       and nullif(btrim(sp.bank_account_name), '') is not null and nullif(btrim(sp.bank_account_number), '') is not null
       and lower(regexp_replace(btrim(sp.bank_account_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g'))
       and exists (select 1 from public.staff_hub_verifications h
                    where h.user_id = _agent and h.outcome = 'passed' and h.person_present and h.nin_document_checked
                      and h.nin_matches_profile and h.photo_matches_person
                      and not exists (select 1 from public.staff_hub_verifications later
                                       where later.user_id = h.user_id and later.verified_at > h.verified_at and later.outcome = 'rejected')))
$$;

-- Agent's withdrawal screen.
create or replace function public.my_commission_wallet()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _avail bigint; _min bigint; _pending boolean;
begin
  if _u is null or not private.is_active() or not exists (select 1 from public.user_roles where user_id = _u and role in ('commission_agent', 'delivery_agent')) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount_kobo), 0)::bigint into _avail from public.commissions where agent_id = _u and status = 'approved' and payout_id is null;
  select coalesce((value->>'min_payout_kobo')::bigint, 100000) into _min from public.settings where key = 'commission';
  _pending := exists (select 1 from public.commission_payouts where agent_id = _u and status in ('pending', 'approved'));
  return jsonb_build_object('started', (select nullif(value->>'at', '') is not null from public.settings where key = 'capital_recovered') is true or private.unlocked(),
    'available_kobo', _avail, 'fee_pct', private.running_costs_pct(), 'fee_kobo', private.running_costs_of(_avail),
    'net_kobo', _avail - private.running_costs_of(_avail), 'minimum_kobo', coalesce(_min, 100000),
    'pending_withdrawal', _pending, 'bank_ok', private.agent_bank_ok(_u));
end $$;

-- Agent asks to withdraw everything that is approved and not yet paid. 10% is kept for running costs.
create or replace function public.request_commission_withdrawal()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _gross bigint; _fee bigint; _min bigint; _from date; _id uuid;
begin
  if _u is null or not private.is_active() or not exists (select 1 from public.user_roles where user_id = _u and role in ('commission_agent', 'delivery_agent')) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agent_commission_holds h where h.agent_id = _u and h.ends_at > now()) then raise exception 'commission_on_hold' using errcode = 'P0001'; end if;
  if exists (select 1 from public.commission_payouts where agent_id = _u and status in ('pending', 'approved')) then raise exception 'withdrawal_already_pending' using errcode = 'P0001'; end if;
  if not private.agent_bank_ok(_u) then raise exception 'verified_bank_account_required' using errcode = 'P0001'; end if;

  perform 1 from public.commissions where agent_id = _u and status = 'approved' and payout_id is null for update;
  select coalesce(sum(amount_kobo), 0)::bigint, min(created_at)::date into _gross, _from
    from public.commissions where agent_id = _u and status = 'approved' and payout_id is null;
  select coalesce((value->>'min_payout_kobo')::bigint, 100000) into _min from public.settings where key = 'commission';
  if _gross <= 0 or _gross < coalesce(_min, 100000) then raise exception 'minimum_payout_not_met' using errcode = 'P0001'; end if;
  _fee := private.running_costs_of(_gross);

  insert into public.commission_payouts (agent_id, period_start, period_end, amount_kobo, gross_kobo, running_costs_kobo, note, created_by, requested_by)
  values (_u, _from, private.today_lagos(), _gross - _fee, _gross, _fee, 'Requested by the agent in the app', _u, _u)
  returning id into _id;
  update public.commissions set payout_id = _id, updated_at = now() where agent_id = _u and status = 'approved' and payout_id is null;

  insert into public.user_notifications (user_id, title, body, kind)
  select r.user_id, 'Commission withdrawal request', 'An agent asked to withdraw ' || to_char((_gross - _fee) / 100.0, 'FM999,999,990.00') || ' naira. Review it in Commissions and payouts.', 'payout'
    from public.user_roles r where r.role = 'super_admin';
  return jsonb_build_object('payout_id', _id, 'gross_kobo', _gross, 'fee_kobo', _fee, 'net_kobo', _gross - _fee);
end $$;
revoke all on function public.request_commission_withdrawal() from public, anon;
grant execute on function public.request_commission_withdrawal() to authenticated;
revoke all on function public.my_commission_wallet() from public, anon;
grant execute on function public.my_commission_wallet() to authenticated;

-- Admin-created payouts keep the same 10% for running costs.
create or replace function public.create_commission_payout(_agent uuid, _from date, _to date, _note text default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare _id uuid; _amount bigint; _minimum bigint; _fee bigint;
begin
  if not (private.has_role('admin'::public.staff_role) or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if _to < _from then raise exception 'invalid_period'; end if;
  if not exists (select 1 from public.user_roles where user_id = _agent and role in ('commission_agent', 'delivery_agent')) then
    raise exception 'not_commission_agent';
  end if;
  if not private.agent_bank_ok(_agent) then raise exception 'verified_bank_account_required'; end if;
  if exists (select 1 from public.commission_payouts where agent_id = _agent and status in ('pending', 'approved')) then
    raise exception 'withdrawal_already_pending';
  end if;

  select coalesce((s.value->>'min_payout_kobo')::bigint, 100000) into _minimum from public.settings s where s.key = 'commission';
  _minimum := coalesce(_minimum, 100000);

  perform c.id from public.commissions c
   where c.agent_id = _agent and c.status = 'approved' and c.payout_id is null and c.created_at::date between _from and _to
   for update;
  select coalesce(sum(c.amount_kobo), 0)::bigint into _amount from public.commissions c
   where c.agent_id = _agent and c.status = 'approved' and c.payout_id is null and c.created_at::date between _from and _to;
  if _amount < _minimum then raise exception 'minimum_payout_not_met'; end if;
  _fee := private.running_costs_of(_amount);

  insert into public.commission_payouts (agent_id, period_start, period_end, amount_kobo, gross_kobo, running_costs_kobo, note, created_by)
  values (_agent, _from, _to, _amount - _fee, _amount, _fee, nullif(btrim(_note), ''), auth.uid())
  returning id into _id;
  update public.commissions set payout_id = _id, updated_at = now()
   where agent_id = _agent and status = 'approved' and payout_id is null and created_at::date between _from and _to;
  return _id;
end
$function$;

-- ================================================================ 3. SAVINGS
alter table public.staff_pay add column if not exists savings_pct smallint not null default 10;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_pay_savings_pct_check') then
    alter table public.staff_pay add constraint staff_pay_savings_pct_check check (savings_pct in (10, 15, 20));
  end if;
end $$;

-- Nobody (not even a super admin) can lower a savings rate.
create or replace function private.staff_pay_savings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.savings_pct < old.savings_pct then raise exception 'savings_rate_cannot_decrease' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists staff_pay_savings_guard on public.staff_pay;
create trigger staff_pay_savings_guard before update of savings_pct on public.staff_pay
  for each row execute function private.staff_pay_savings_guard();

create table if not exists public.salary_months (
  month date primary key check (extract(day from month) = 1),
  total_salary_kobo bigint not null default 0,
  total_saved_kobo bigint not null default 0,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz not null default now()
);
alter table public.salary_months enable row level security;
drop policy if exists salary_months_read on public.salary_months;
create policy salary_months_read on public.salary_months for select to authenticated using ((select private.is_super_admin()));

create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id),
  kind text not null check (kind in ('deposit', 'payout')),
  month date check (month is null or extract(day from month) = 1),
  salary_kobo bigint check (salary_kobo is null or salary_kobo >= 0),
  pct smallint,
  amount_kobo bigint not null check (amount_kobo > 0),
  take_home_kobo bigint,
  reference text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (kind <> 'deposit' or month is not null)
);
create unique index if not exists savings_entries_one_deposit_per_month on public.savings_entries (staff_id, month) where kind = 'deposit';
create index if not exists savings_entries_staff on public.savings_entries (staff_id, created_at desc);
alter table public.savings_entries enable row level security;
drop policy if exists savings_entries_read on public.savings_entries;
create policy savings_entries_read on public.savings_entries for select to authenticated
  using (staff_id = (select auth.uid()) or (select private.is_super_admin()));

create table if not exists public.staff_exits (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users (id),
  kind text not null check (kind in ('resignation', 'dismissal')),
  reason text,
  notice_given_at timestamptz not null default now(),
  last_day date not null,
  recorded_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  savings_paid_at timestamptz
);
create unique index if not exists staff_exits_one_open on public.staff_exits (staff_id) where cancelled_at is null;
alter table public.staff_exits enable row level security;
drop policy if exists staff_exits_read on public.staff_exits;
create policy staff_exits_read on public.staff_exits for select to authenticated
  using (staff_id = (select auth.uid()) or (select private.is_super_admin()));

create or replace function private.savings_balance(_staff uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when kind = 'deposit' then amount_kobo else -amount_kobo end), 0)::bigint
    from public.savings_entries where staff_id = _staff
$$;

-- Staff: my savings page.
create or replace function public.my_savings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _pay public.staff_pay; _x public.staff_exits;
begin
  if _u is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select * into _pay from public.staff_pay where user_id = _u;
  select * into _x from public.staff_exits where staff_id = _u and cancelled_at is null;
  return jsonb_build_object(
    'on_salary', _pay.user_id is not null and _pay.active,
    'pct', coalesce(_pay.savings_pct, 10), 'salary_kobo', _pay.base_salary_kobo,
    'balance_kobo', private.savings_balance(_u),
    'earliest_last_day', (private.today_lagos() + interval '2 months')::date,
    'exit', case when _x.id is null then null else jsonb_build_object('kind', _x.kind, 'last_day', _x.last_day,
       'notice_given_at', _x.notice_given_at, 'savings_paid_at', _x.savings_paid_at) end,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'month', month, 'salary_kobo', salary_kobo, 'pct', pct,
         'amount_kobo', amount_kobo, 'take_home_kobo', take_home_kobo, 'created_at', created_at) order by created_at desc)
       from (select * from public.savings_entries where staff_id = _u order by created_at desc limit 36) e), '[]'::jsonb));
end $$;

-- Staff: raise my rate to 15% or 20%. Cannot be lowered again.
create or replace function public.set_my_savings_rate(_pct integer)
returns void language plpgsql security definer set search_path = '' as $$
declare _cur smallint;
begin
  if auth.uid() is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select savings_pct into _cur from public.staff_pay where user_id = auth.uid() and active for update;
  if not found then raise exception 'not_on_salary' using errcode = 'P0001'; end if;
  if _pct is null or _pct not in (15, 20) then raise exception 'invalid_savings_rate' using errcode = 'P0001'; end if;
  if _pct <= _cur then raise exception 'savings_rate_cannot_decrease' using errcode = 'P0001'; end if;
  update public.staff_pay set savings_pct = _pct, updated_at = now() where user_id = auth.uid();
end $$;

-- Staff: resign with at least two months' notice.
create or replace function public.give_notice(_last_day date, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare _who text;
begin
  if auth.uid() is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_pay where user_id = auth.uid() and active) then raise exception 'not_on_salary' using errcode = 'P0001'; end if;
  if _last_day is null or _last_day < (private.today_lagos() + interval '2 months')::date then raise exception 'notice_too_short' using errcode = 'P0001'; end if;
  if _last_day > (private.today_lagos() + interval '12 months')::date then raise exception 'notice_too_long' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_exits where staff_id = auth.uid() and cancelled_at is null) then raise exception 'notice_already_given' using errcode = 'P0001'; end if;
  insert into public.staff_exits (staff_id, kind, reason, last_day, recorded_by)
  values (auth.uid(), 'resignation', nullif(btrim(left(coalesce(_reason, ''), 500)), ''), _last_day, auth.uid());
  select coalesce(nullif(full_name, ''), 'A staff member') into _who from public.profiles where id = auth.uid();
  insert into public.user_notifications (user_id, title, body, kind)
  select r.user_id, 'Resignation notice', _who || ' gave notice. Last day: ' || to_char(_last_day, 'DD Mon YYYY') || '. Their savings are due then.', 'staff'
    from public.user_roles r where r.role = 'super_admin';
end $$;

-- Super admin: savings overview.
create or replace function public.savings_board()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _today date := private.today_lagos(); _month date := date_trunc('month', private.today_lagos())::date;
begin
  perform private.require_super_admin();
  return jsonb_build_object(
    'today', _today, 'this_month', _month,
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'total_salary_kobo', total_salary_kobo, 'total_saved_kobo', total_saved_kobo, 'confirmed_at', confirmed_at) order by month desc)
       from (select * from public.salary_months order by month desc limit 24) m), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(s.r order by s.r->>'name') from (
       select jsonb_build_object('staff_id', u.id, 'name', p.full_name, 'job_title', sp.job_title, 'active', coalesce(sp.active, false),
         'salary_kobo', sp.base_salary_kobo, 'pct', coalesce(sp.savings_pct, 10), 'balance_kobo', private.savings_balance(u.id),
         'bank_name', pr.bank_name, 'account_number', pr.bank_account_number, 'account_name', pr.bank_account_name,
         'exit', case when x.id is null then null else jsonb_build_object('kind', x.kind, 'last_day', x.last_day, 'reason', x.reason,
            'notice_given_at', x.notice_given_at, 'savings_paid_at', x.savings_paid_at, 'due', x.kind = 'dismissal' or x.last_day <= _today) end) as r
         from (select user_id as id from public.staff_pay union select staff_id from public.savings_entries union select staff_id from public.staff_exits where cancelled_at is null) u
         join public.profiles p on p.id = u.id
         left join public.staff_pay sp on sp.user_id = u.id
         left join public.staff_profiles pr on pr.user_id = u.id
         left join public.staff_exits x on x.staff_id = u.id and x.cancelled_at is null) s), '[]'::jsonb));
end $$;

-- Super admin: confirm a month's salaries. Each person's savings rate is put aside from their salary.
-- _lines: [{"staff_id": "...", "salary_kobo": 7000000}, ...]
create or replace function public.confirm_salaries(_month date, _lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _m date; _l jsonb; _staff uuid; _salary bigint; _pct smallint; _saved bigint; _tot_salary bigint := 0; _tot_saved bigint := 0; _n int := 0;
begin
  perform private.require_super_admin();
  _m := date_trunc('month', _month)::date;
  if _month is null or _m > date_trunc('month', private.today_lagos())::date then raise exception 'invalid_month' using errcode = 'P0001'; end if;
  if exists (select 1 from public.salary_months where month = _m) then raise exception 'month_already_confirmed' using errcode = 'P0001'; end if;
  if _lines is null or jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 then raise exception 'no_salaries' using errcode = 'P0001'; end if;
  insert into public.salary_months (month, confirmed_by) values (_m, auth.uid());
  for _l in select * from jsonb_array_elements(_lines) loop
    _staff := (_l->>'staff_id')::uuid; _salary := (_l->>'salary_kobo')::bigint;
    if _salary is null or _salary < 0 or _salary > 100000000000 then raise exception 'invalid_salary' using errcode = 'P0001'; end if;
    select savings_pct into _pct from public.staff_pay where user_id = _staff;
    if not found then raise exception 'not_on_salary' using errcode = 'P0001'; end if;
    _saved := round(_salary * _pct / 100.0)::bigint;
    _tot_salary := _tot_salary + _salary; _tot_saved := _tot_saved + _saved; _n := _n + 1;
    if _saved > 0 then
      insert into public.savings_entries (staff_id, kind, month, salary_kobo, pct, amount_kobo, take_home_kobo, created_by)
      values (_staff, 'deposit', _m, _salary, _pct, _saved, _salary - _saved, auth.uid());
    end if;
  end loop;
  update public.salary_months set total_salary_kobo = _tot_salary, total_saved_kobo = _tot_saved where month = _m;
  return jsonb_build_object('month', _m, 'people', _n, 'total_salary_kobo', _tot_salary, 'total_saved_kobo', _tot_saved);
end $$;

-- Super admin: record a dismissal. Savings are due straight away (they are the person's right).
create or replace function public.record_dismissal(_staff uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_pay where user_id = _staff) and not exists (select 1 from public.savings_entries where staff_id = _staff) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  update public.staff_exits set cancelled_at = now(), cancelled_by = auth.uid()
   where staff_id = _staff and cancelled_at is null and savings_paid_at is null;
  if exists (select 1 from public.staff_exits where staff_id = _staff and cancelled_at is null) then raise exception 'savings_already_paid' using errcode = 'P0001'; end if;
  insert into public.staff_exits (staff_id, kind, reason, last_day, recorded_by)
  values (_staff, 'dismissal', btrim(left(_reason, 500)), private.today_lagos(), auth.uid());
end $$;

-- Super admin: withdraw a notice (for example the person changed their mind), before savings are paid.
create or replace function public.cancel_staff_exit(_staff uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  update public.staff_exits set cancelled_at = now(), cancelled_by = auth.uid()
   where staff_id = _staff and cancelled_at is null and savings_paid_at is null;
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

-- Super admin: pay out someone's savings once due (end of notice, or dismissal).
create or replace function public.pay_out_savings(_staff uuid, _reference text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare _x public.staff_exits; _bal bigint;
begin
  perform private.require_super_admin();
  if length(btrim(coalesce(_reference, ''))) < 3 then raise exception 'payment_method_and_reference_required' using errcode = 'P0001'; end if;
  select * into _x from public.staff_exits where staff_id = _staff and cancelled_at is null for update;
  if not found then raise exception 'savings_not_due' using errcode = 'P0001'; end if;
  if _x.savings_paid_at is not null then raise exception 'savings_already_paid' using errcode = 'P0001'; end if;
  if _x.kind = 'resignation' and _x.last_day > private.today_lagos() then raise exception 'savings_not_due' using errcode = 'P0001'; end if;
  perform 1 from public.savings_entries where staff_id = _staff for update;
  _bal := private.savings_balance(_staff);
  if _bal <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;
  insert into public.savings_entries (staff_id, kind, amount_kobo, reference, created_by) values (_staff, 'payout', _bal, btrim(_reference), auth.uid());
  update public.staff_exits set savings_paid_at = now() where id = _x.id;
  insert into public.user_notifications (user_id, title, body, kind)
  values (_staff, 'Your savings have been paid', 'We sent your savings of ' || to_char(_bal / 100.0, 'FM999,999,990.00') || ' naira.', 'savings');
  return _bal;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.my_savings()', 'public.set_my_savings_rate(integer)', 'public.give_notice(date, text)', 'public.savings_board()',
    'public.confirm_salaries(date, jsonb)', 'public.record_dismissal(uuid, text)', 'public.cancel_staff_exit(uuid)', 'public.pay_out_savings(uuid, text)',
    'public.weekly_board(date)', 'public.my_pay_overview()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
