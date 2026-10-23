-- Staff onboarding, pay overview, weekly units payout, profit-only payroll.
alter table public.staff_profiles add column if not exists initial_pw_hash text;

-- Profit only: the recovery measure can never be switched to revenue.
create or replace function private.settings_profit_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.key = 'recovery' and coalesce(new.value->>'basis', 'profit') <> 'profit' then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger settings_profit_only before insert or update on public.settings for each row execute function private.settings_profit_only();

create or replace function private.recovery_core()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _cap bigint; _rent bigint; _rev bigint; _tx bigint; _first date; _exp bigint; _m bigint;
        _today date := private.today_lagos(); _days int; _wrev bigint; _wexp bigint; _avg bigint; _cp numeric; _rp numeric;
begin
  select coalesce(sum(amount_kobo) filter (where kind = 'capital'), 0), coalesce(sum(amount_kobo) filter (where kind = 'rent'), 0)
    into _cap, _rent from public.capital_entries where status = 'approved';
  select coalesce(sum(gross_kobo - refunded_kobo), 0), coalesce(sum(txn_count), 0), min(day) into _rev, _tx, _first from public.daily_sales_summary;
  select coalesce(sum(amount_kobo), 0) into _exp from public.expenses where status = 'approved';
  _m := _rev - _exp;
  _days := case when _first is null then 1 else greatest(1, least(30, _today - _first + 1)) end;
  select coalesce(sum(gross_kobo - refunded_kobo), 0) into _wrev from public.daily_sales_summary where day > _today - _days;
  select coalesce(sum(amount_kobo), 0) into _wexp from public.expenses where status = 'approved' and spent_on > _today - _days;
  _avg := (_wrev - _wexp) / _days;
  _cp := case when _cap = 0 then 0 else least(100, greatest(0, _m)::numeric * 100 / _cap) end;
  _rp := case when _rent = 0 then 0 else least(100, greatest(0, _m - _cap)::numeric * 100 / _rent) end;
  return jsonb_build_object('basis', 'profit', 'capital_kobo', _cap, 'rent_kobo', _rent, 'revenue_kobo', _rev, 'expenses_kobo', _exp,
    'measured_kobo', _m, 'avg_daily_kobo', _avg, 'days_used', _days, 'txn_count', _tx,
    'capital_pct', round(_cp, 1), 'rent_pct', round(_rp, 1),
    'capital_recovered', (_cap > 0 and _m >= _cap),
    'rent_recovered', (_rent > 0 and _cap > 0 and _m >= _cap + _rent),
    'both_recovered', (_cap > 0 and _rent > 0 and _m >= _cap + _rent));
end $$;

create or replace function private.month_profit(_first date) returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(gross_kobo - refunded_kobo) from public.daily_sales_summary
                    where day >= _first and day < (_first + interval '1 month')::date), 0)
       - coalesce((select sum(amount_kobo) from public.expenses
                    where status = 'approved' and spent_on >= _first and spent_on < (_first + interval '1 month')::date), 0)
$$;

create or replace function private.unlocked() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((private.recovery_core()->>'capital_recovered')::boolean, false)
$$;

-- Payroll: purely profit, unlocked only when start-up capital is recovered.
create or replace function public.compute_payroll(_month date) returns uuid language plpgsql security definer set search_path = '' as $$
declare _first date := date_trunc('month', _month)::date;
        _next date := (date_trunc('month', _month) + interval '1 month')::date;
        _run uuid; _status text; _p jsonb; _recovered boolean; _cap numeric; _limit int; _biz_target bigint; _profit bigint;
begin
  perform private.require_super_admin();
  select value into _p from public.settings where key = 'payroll';
  _cap := coalesce((_p->>'surcharge_cap_pct')::numeric, 20);
  _limit := coalesce((_p->>'strikes_limit')::int, 3);
  select nullif(value->>'monthly_net_kobo', '')::bigint into _biz_target from public.settings where key = 'targets';
  _recovered := private.unlocked();
  _profit := private.month_profit(_first);

  select id, status into _run, _status from public.payroll_runs where month = _first;
  if found then
    if _status <> 'draft' then raise exception 'run_locked' using errcode = 'P0001'; end if;
    update public.payroll_runs set recovery_cleared = _recovered where id = _run;
  else
    insert into public.payroll_runs (month, recovery_cleared, created_by) values (_first, _recovered, auth.uid()) returning id into _run;
  end if;

  insert into public.payslips (run_id, staff_id, base_kobo, boosted_kobo, used_boosted, target_met, strikes, gross_kobo,
                               surcharge_total_kobo, surcharge_applied_kobo, net_kobo)
  select _run, z.user_id, z.base_salary_kobo, z.boosted_salary_kobo, z.used, z.tmet, z.strikes, z.gross, z.sur, z.applied, z.gross - z.applied
  from (
    select y.*, least(y.sur, floor(y.gross * _cap / 100)::bigint) as applied
    from (
      select sp.user_id, sp.base_salary_kobo, sp.boosted_salary_kobo, a.sur, a.strikes, t.tmet,
             (_recovered and t.tmet and a.strikes <= _limit and sp.boosted_salary_kobo > 0) as used,
             case when (_recovered and t.tmet and a.strikes <= _limit and sp.boosted_salary_kobo > 0)
                  then sp.boosted_salary_kobo else sp.base_salary_kobo end as gross
        from public.staff_pay sp
        cross join lateral (select coalesce(sum(att.surcharge_kobo), 0)::bigint as sur,
                                   (count(*) filter (where att.surcharge_kobo > 0 or att.status = 'absent'))::int as strikes
                              from public.attendance att join public.shifts s on s.id = att.shift_id
                             where att.staff_id = sp.user_id and s.shift_date >= _first and s.shift_date < _next) a
        cross join lateral (select (coalesce(sp.monthly_target_kobo, _biz_target) is not null
                                    and _profit >= coalesce(sp.monthly_target_kobo, _biz_target)) as tmet) t
       where sp.active
    ) y
  ) z
  on conflict (run_id, staff_id) do update set
    base_kobo = excluded.base_kobo, boosted_kobo = excluded.boosted_kobo, used_boosted = excluded.used_boosted,
    target_met = excluded.target_met, strikes = excluded.strikes, gross_kobo = excluded.gross_kobo,
    surcharge_total_kobo = excluded.surcharge_total_kobo, surcharge_applied_kobo = excluded.surcharge_applied_kobo,
    net_kobo = excluded.net_kobo;
  return _run;
end $$;

-- Pay terms (super admin).
create or replace function public.set_staff_pay(_user uuid, _job_title text, _base bigint, _boosted bigint, _monthly_target bigint, _weekly boolean, _active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.user_roles where user_id = _user) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if _base is null or _boosted is null or _base < 0 or _boosted < _base or _boosted > 100000000000 then raise exception 'invalid_pay' using errcode = 'P0001'; end if;
  if _monthly_target is not null and _monthly_target < 1 then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if length(coalesce(_job_title, '')) > 80 then raise exception 'invalid_pay' using errcode = 'P0001'; end if;
  insert into public.staff_pay (user_id, job_title, base_salary_kobo, boosted_salary_kobo, monthly_target_kobo, earns_weekly_bonus, active, hired_on)
  values (_user, nullif(trim(_job_title), ''), _base, _boosted, _monthly_target, coalesce(_weekly, false), coalesce(_active, true), private.today_lagos())
  on conflict (user_id) do update set job_title = excluded.job_title, base_salary_kobo = excluded.base_salary_kobo,
    boosted_salary_kobo = excluded.boosted_salary_kobo, monthly_target_kobo = excluded.monthly_target_kobo,
    earns_weekly_bonus = excluded.earns_weekly_bonus, active = excluded.active, updated_at = now();
end $$;

-- Shared profile writer.
create or replace function private.write_staff_profile(_user uuid, _d jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare _k text; _ph text; _allowed text[] := array['nin','photo_path','date_of_birth','home_address','referee_name','referee_phone','referee_address',
  'referee_relationship','next_of_kin_name','next_of_kin_phone','bank_name','bank_account_number','bank_account_name'];
        _old text;
begin
  if _d is null or jsonb_typeof(_d) <> 'object' then raise exception 'invalid_profile' using errcode = 'P0001'; end if;
  for _k in select jsonb_object_keys(_d) loop
    if _k <> all(_allowed) then raise exception 'invalid_profile' using errcode = 'P0001'; end if;
    if length(coalesce(_d->>_k, '')) > 300 then raise exception 'invalid_profile' using errcode = 'P0001'; end if;
  end loop;
  if _d ? 'nin' and nullif(trim(_d->>'nin'), '') is not null and trim(_d->>'nin') !~ '^\d{11}$' then raise exception 'invalid_nin' using errcode = 'P0001'; end if;
  if _d ? 'bank_account_number' and nullif(trim(_d->>'bank_account_number'), '') is not null and trim(_d->>'bank_account_number') !~ '^\d{10}$' then raise exception 'invalid_account' using errcode = 'P0001'; end if;
  foreach _k in array array['referee_phone','next_of_kin_phone'] loop
    if _d ? _k and nullif(trim(_d->>_k), '') is not null then
      _ph := regexp_replace(_d->>_k, '\D', '', 'g');
      if length(_ph) < 10 or length(_ph) > 15 then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
    end if;
  end loop;
  if _d ? 'date_of_birth' and nullif(trim(_d->>'date_of_birth'), '') is not null then
    if (_d->>'date_of_birth') !~ '^\d{4}-\d{2}-\d{2}$' or (_d->>'date_of_birth')::date > private.today_lagos() - 5840 or (_d->>'date_of_birth')::date < date '1930-01-01' then
      raise exception 'invalid_dob' using errcode = 'P0001';
    end if;
  end if;
  if _d ? 'photo_path' and nullif(trim(_d->>'photo_path'), '') is not null then
    if left(_d->>'photo_path', length(_user::text) + 1) <> _user::text || '/'
       or not exists (select 1 from storage.objects where bucket_id = 'staff-docs' and name = _d->>'photo_path') then
      raise exception 'invalid_photo' using errcode = 'P0001';
    end if;
  end if;

  insert into public.staff_profiles (user_id) values (_user) on conflict (user_id) do nothing;
  select photo_path into _old from public.staff_profiles where user_id = _user;
  begin
    update public.staff_profiles set
      nin = case when _d ? 'nin' then nullif(trim(_d->>'nin'), '') else nin end,
      photo_path = case when _d ? 'photo_path' then nullif(trim(_d->>'photo_path'), '') else photo_path end,
      photo_taken_at = case when _d ? 'photo_path' and nullif(trim(_d->>'photo_path'), '') is distinct from _old then now() else photo_taken_at end,
      date_of_birth = case when _d ? 'date_of_birth' then nullif(trim(_d->>'date_of_birth'), '')::date else date_of_birth end,
      home_address = case when _d ? 'home_address' then nullif(trim(_d->>'home_address'), '') else home_address end,
      referee_name = case when _d ? 'referee_name' then nullif(trim(_d->>'referee_name'), '') else referee_name end,
      referee_phone = case when _d ? 'referee_phone' then nullif(trim(_d->>'referee_phone'), '') else referee_phone end,
      referee_address = case when _d ? 'referee_address' then nullif(trim(_d->>'referee_address'), '') else referee_address end,
      referee_relationship = case when _d ? 'referee_relationship' then nullif(trim(_d->>'referee_relationship'), '') else referee_relationship end,
      next_of_kin_name = case when _d ? 'next_of_kin_name' then nullif(trim(_d->>'next_of_kin_name'), '') else next_of_kin_name end,
      next_of_kin_phone = case when _d ? 'next_of_kin_phone' then nullif(trim(_d->>'next_of_kin_phone'), '') else next_of_kin_phone end,
      bank_name = case when _d ? 'bank_name' then nullif(trim(_d->>'bank_name'), '') else bank_name end,
      bank_account_number = case when _d ? 'bank_account_number' then nullif(trim(_d->>'bank_account_number'), '') else bank_account_number end,
      bank_account_name = case when _d ? 'bank_account_name' then nullif(trim(_d->>'bank_account_name'), '') else bank_account_name end
    where user_id = _user;
  exception when unique_violation then
    raise exception 'nin_in_use' using errcode = 'P0001';
  end;
end $$;

create or replace function private.profile_complete(_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select nin is not null and photo_path is not null and home_address is not null and date_of_birth is not null
      and referee_name is not null and referee_phone is not null and referee_address is not null and referee_relationship is not null
      and next_of_kin_name is not null and next_of_kin_phone is not null
      and bank_name is not null and bank_account_number is not null and bank_account_name is not null
    from public.staff_profiles where user_id = _user), false)
$$;

create or replace function public.save_my_staff_profile(_data jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare _s text; _u uuid := auth.uid();
begin
  if _u is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select onboarding_status into _s from public.staff_profiles where user_id = _u;
  if _s in ('submitted', 'verified') then raise exception 'profile_locked' using errcode = 'P0001'; end if;
  perform private.write_staff_profile(_u, _data);
  update public.staff_profiles set onboarding_status = 'incomplete' where user_id = _u and onboarding_status = 'rejected';
end $$;

create or replace function public.admin_save_staff_profile(_user uuid, _data jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.user_roles where user_id = _user) then raise exception 'not_staff' using errcode = 'P0001'; end if;
  perform private.write_staff_profile(_user, _data);
end $$;

create or replace function public.submit_onboarding() returns void language plpgsql security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _s text;
begin
  if _u is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select onboarding_status into _s from public.staff_profiles where user_id = _u;
  if _s is null or _s in ('submitted', 'verified') then raise exception 'profile_locked' using errcode = 'P0001'; end if;
  if not private.profile_complete(_u) then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
  update public.staff_profiles set onboarding_status = 'submitted', review_note = null where user_id = _u;
end $$;

create or replace function public.verify_staff(_user uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.staff_profiles where user_id = _user) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _approve then
    if not private.profile_complete(_user) then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
    update public.staff_profiles set onboarding_status = 'verified', verified_by = auth.uid(), verified_at = now(), review_note = null where user_id = _user;
  else
    if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.staff_profiles set onboarding_status = 'rejected', review_note = trim(_note), verified_by = null, verified_at = null where user_id = _user;
  end if;
end $$;

-- Initial password flag: only the edge function (service role) may set it.
create or replace function public.flag_initial_password(_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_profiles (user_id) values (_user) on conflict (user_id) do nothing;
  update public.staff_profiles set must_change_password = true,
    initial_pw_hash = (select encrypted_password from auth.users where id = _user) where user_id = _user;
end $$;

create or replace function public.acknowledge_password_changed() returns void language plpgsql security definer set search_path = '' as $$
declare _u uuid := auth.uid();
begin
  if _u is null then raise exception 'not_staff' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_profiles sp join auth.users u on u.id = sp.user_id
              where sp.user_id = _u and sp.must_change_password and u.encrypted_password is not distinct from sp.initial_pw_hash) then
    raise exception 'password_not_changed' using errcode = 'P0001';
  end if;
  update public.staff_profiles set must_change_password = false, initial_pw_hash = null where user_id = _u;
end $$;

-- Weekly units.
create or replace function public.set_weekly_bonus(_units integer, _payout_kobo bigint) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if (_units is not null and (_units < 1 or _units > 1000000)) or _payout_kobo is null or _payout_kobo < 1 or _payout_kobo > 100000000000 then
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;
  update public.settings set value = jsonb_build_object('units_target', _units, 'payout_kobo', _payout_kobo) where key = 'weekly_bonus';
end $$;

create or replace function public.log_units(_staff uuid, _units integer, _note text) returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid;
begin
  if auth.uid() is null or not private.is_admin() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _units is null or _units < 1 or _units > 5000 then raise exception 'invalid_units' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_pay where user_id = _staff and active and earns_weekly_bonus) then raise exception 'not_on_weekly_plan' using errcode = 'P0001'; end if;
  insert into public.unit_log (staff_id, units, note, logged_by) values (_staff, _units, nullif(trim(_note), ''), auth.uid()) returning id into _id;
  return _id;
end $$;

create or replace function public.void_units(_id uuid, _reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.unit_log set voided_at = now(), voided_by = auth.uid(), void_reason = trim(_reason) where id = _id and voided_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function public.weekly_board(_week_start date default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _w date := coalesce(date_trunc('week', _week_start)::date, date_trunc('week', private.today_lagos())::date);
        _s jsonb; _t int; _pay bigint;
begin
  perform private.require_super_admin();
  select value into _s from public.settings where key = 'weekly_bonus';
  _t := nullif(_s->>'units_target', '')::int; _pay := coalesce((_s->>'payout_kobo')::bigint, 10000000);
  return jsonb_build_object('week_start', _w, 'week_end', _w + 6, 'target_units', _t, 'payout_kobo', _pay,
    'unlocked', private.unlocked(), 'week_over', (_w + 7 <= private.today_lagos()),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', sp.user_id, 'name', p.full_name, 'job_title', sp.job_title, 'units', u.units,
        'pct', case when _t is null then null else least(100, round(u.units * 100.0 / _t, 1)) end,
        'met', (_t is not null and u.units >= _t),
        'payout_id', wp.id, 'payout_status', wp.status, 'payout_kobo', wp.amount_kobo) order by p.full_name)
      from public.staff_pay sp join public.profiles p on p.id = sp.user_id
      cross join lateral (select coalesce(sum(l.units), 0)::int as units from public.unit_log l
         where l.staff_id = sp.user_id and l.voided_at is null
           and (l.logged_at at time zone 'Africa/Lagos')::date >= _w and (l.logged_at at time zone 'Africa/Lagos')::date < _w + 7) u
      left join public.weekly_payouts wp on wp.staff_id = sp.user_id and wp.week_start = _w
      where sp.active and sp.earns_weekly_bonus), '[]'::jsonb));
end $$;

create or replace function public.close_week(_week_start date) returns integer language plpgsql security definer set search_path = '' as $$
declare _w date; _s jsonb; _t int; _pay bigint; _n int;
begin
  perform private.require_super_admin();
  if _week_start is null or extract(isodow from _week_start) <> 1 then raise exception 'invalid_week' using errcode = 'P0001'; end if;
  _w := _week_start;
  if _w + 7 > private.today_lagos() then raise exception 'week_not_over' using errcode = 'P0001'; end if;
  if not private.unlocked() then raise exception 'startup_costs_not_recovered' using errcode = 'P0001'; end if;
  select value into _s from public.settings where key = 'weekly_bonus';
  _t := nullif(_s->>'units_target', '')::int; _pay := coalesce((_s->>'payout_kobo')::bigint, 10000000);
  if _t is null then raise exception 'weekly_target_not_set' using errcode = 'P0001'; end if;
  insert into public.weekly_payouts (staff_id, week_start, units, target_units, amount_kobo, created_by)
  select sp.user_id, _w, u.units, _t, _pay, auth.uid()
    from public.staff_pay sp
    cross join lateral (select coalesce(sum(l.units), 0)::int as units from public.unit_log l
       where l.staff_id = sp.user_id and l.voided_at is null
         and (l.logged_at at time zone 'Africa/Lagos')::date >= _w and (l.logged_at at time zone 'Africa/Lagos')::date < _w + 7) u
   where sp.active and sp.earns_weekly_bonus and u.units >= _t
  on conflict (staff_id, week_start) do nothing;
  get diagnostics _n = row_count;
  return _n;
end $$;

create or replace function public.mark_payout_paid(_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  update public.weekly_payouts set status = 'paid', paid_by = auth.uid(), paid_at = now() where id = _id and status = 'earned';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;

-- What a staff member sees: percentages only.
create or replace function public.my_pay_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _c jsonb; _unlocked boolean; _pay public.staff_pay; _first date := date_trunc('month', private.today_lagos())::date;
        _target bigint; _profit bigint; _wt int; _w date := date_trunc('week', private.today_lagos())::date; _units int; _wb jsonb;
begin
  if _u is null or not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  _c := private.recovery_core(); _unlocked := coalesce((_c->>'capital_recovered')::boolean, false);
  select * into _pay from public.staff_pay where user_id = _u;
  select value into _wb from public.settings where key = 'weekly_bonus';
  _wt := nullif(_wb->>'units_target', '')::int;
  _target := coalesce(_pay.monthly_target_kobo, (select nullif(value->>'monthly_net_kobo', '')::bigint from public.settings where key = 'targets'));
  _profit := private.month_profit(_first);
  select coalesce(sum(units), 0)::int into _units from public.unit_log
   where staff_id = _u and voided_at is null and (logged_at at time zone 'Africa/Lagos')::date >= _w and (logged_at at time zone 'Africa/Lagos')::date < _w + 7;
  return jsonb_build_object(
    'has_pay', _pay.user_id is not null, 'job_title', _pay.job_title,
    'base_salary_kobo', _pay.base_salary_kobo, 'target_salary_kobo', _pay.boosted_salary_kobo,
    'unlocked', _unlocked, 'startup_pct', _c->'capital_pct',
    'month_pct', case when not _unlocked or _target is null then null else round(least(100, greatest(0, _profit)::numeric * 100 / _target), 1) end,
    'weekly_enabled', coalesce(_pay.earns_weekly_bonus, false) and _wt is not null,
    'weekly_pct', case when not _unlocked or not coalesce(_pay.earns_weekly_bonus, false) or _wt is null then null else round(least(100, _units * 100.0 / _wt), 1) end,
    'weekly_payout_kobo', coalesce((_wb->>'payout_kobo')::bigint, 10000000),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('week_start', week_start, 'amount_kobo', amount_kobo, 'status', status) order by week_start desc)
                           from (select * from public.weekly_payouts where staff_id = _u order by week_start desc limit 12) x), '[]'::jsonb));
end $$;

create or replace function public.my_staff_state() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _u uuid := auth.uid(); _sp public.staff_profiles; _pay public.staff_pay;
begin
  if _u is null or not private.is_staff() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  select * into _sp from public.staff_profiles where user_id = _u;
  select * into _pay from public.staff_pay where user_id = _u;
  return jsonb_build_object('onboarding_status', coalesce(_sp.onboarding_status, 'incomplete'), 'review_note', _sp.review_note,
    'must_change_password', coalesce(_sp.must_change_password, false),
    'job_title', _pay.job_title, 'base_salary_kobo', _pay.base_salary_kobo, 'target_salary_kobo', _pay.boosted_salary_kobo,
    'profile', to_jsonb(_sp) - 'user_id' - 'initial_pw_hash' - 'verified_by' - 'created_at' - 'updated_at');
end $$;

create or replace function public.admin_staff_detail(_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.user_roles where user_id = _user) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'id', _user,
    'person', (select jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone, 'status', status) from public.profiles where id = _user),
    'roles', (select array_agg(role::text order by role) from public.user_roles where user_id = _user),
    'pay', (select to_jsonb(sp) - 'user_id' from public.staff_pay sp where user_id = _user),
    'profile', (select to_jsonb(p) - 'user_id' - 'initial_pw_hash' from public.staff_profiles p where user_id = _user),
    'payouts', coalesce((select jsonb_agg(to_jsonb(w) - 'staff_id' order by week_start desc) from public.weekly_payouts w where staff_id = _user), '[]'::jsonb));
end $$;

create or replace function public.staff_onboarding_status() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  return coalesce((select jsonb_object_agg(user_id, onboarding_status) from public.staff_profiles), '{}'::jsonb);
end $$;

-- Grants: signed-in users only; the password flag is edge-function only.
do $$
declare _f text;
begin
  foreach _f in array array[
    'set_staff_pay(uuid,text,bigint,bigint,bigint,boolean,boolean)','save_my_staff_profile(jsonb)','admin_save_staff_profile(uuid,jsonb)',
    'submit_onboarding()','verify_staff(uuid,boolean,text)','acknowledge_password_changed()','set_weekly_bonus(integer,bigint)',
    'log_units(uuid,integer,text)','void_units(uuid,text)','weekly_board(date)','close_week(date)','mark_payout_paid(uuid)',
    'my_pay_overview()','my_staff_state()','admin_staff_detail(uuid)','staff_onboarding_status()','compute_payroll(date)'] loop
    execute format('revoke all on function public.%s from public, anon', _f);
    execute format('grant execute on function public.%s to authenticated', _f);
  end loop;
  revoke all on function public.flag_initial_password(uuid) from public, anon, authenticated;
  grant execute on function public.flag_initial_password(uuid) to service_role;
end $$;
