-- Agent bag custody, late hub drop-off alerts, process strikes and loss/damage investigations.
-- This migration is intentionally additive. It does not change any WhatsApp functions or triggers.

create table if not exists public.agent_bag_custody (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pickup_agent_id uuid references auth.users(id),
  delivery_agent_id uuid references auth.users(id),
  picked_up_at timestamptz,
  hub_in_at timestamptz,
  hub_out_at timestamptz,
  delivered_at timestamptz,
  late_alert_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hub_in_at is null or picked_up_at is not null),
  check (hub_out_at is null or hub_in_at is not null),
  check (delivered_at is null or hub_out_at is not null)
);
create index if not exists agent_bag_custody_pickup_watch_idx
  on public.agent_bag_custody(picked_up_at)
  where picked_up_at is not null and hub_in_at is null;
create index if not exists agent_bag_custody_agent_idx
  on public.agent_bag_custody(pickup_agent_id, delivery_agent_id, picked_up_at desc);

create table if not exists public.agent_strikes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id),
  order_id uuid references public.orders(id),
  kind text not null check (kind in ('count_skipped','cash_taken','late_drop')),
  note text not null check (length(btrim(note)) between 3 and 1000),
  strike_number integer not null check (strike_number between 1 and 3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists agent_strikes_agent_time_idx
  on public.agent_strikes(agent_id, created_at desc);

create table if not exists public.agent_commission_holds (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id),
  strike_id uuid not null references public.agent_strikes(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists agent_commission_holds_active_idx
  on public.agent_commission_holds(agent_id, ends_at desc);

create table if not exists public.agent_custody_incidents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  agent_id uuid not null references auth.users(id),
  custody_leg text not null check (custody_leg in ('pickup','delivery')),
  kind text not null check (kind in ('lost','damaged')),
  description text not null check (length(btrim(description)) between 3 and 2000),
  estimated_value_kobo bigint check (estimated_value_kobo is null or estimated_value_kobo >= 0),
  investigation_status text not null default 'open' check (investigation_status in ('open','liable','not_liable')),
  decision_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists agent_custody_incidents_status_idx
  on public.agent_custody_incidents(investigation_status, created_at desc);

alter table public.agent_bag_custody enable row level security;
alter table public.agent_strikes enable row level security;
alter table public.agent_commission_holds enable row level security;
alter table public.agent_custody_incidents enable row level security;

revoke all on public.agent_bag_custody, public.agent_strikes,
  public.agent_commission_holds, public.agent_custody_incidents
  from anon, authenticated;

drop policy if exists agent_bag_custody_super_admin_read on public.agent_bag_custody;
create policy agent_bag_custody_super_admin_read on public.agent_bag_custody
  for select to authenticated using (private.has_role('super_admin'::public.staff_role));
drop policy if exists agent_strikes_super_admin_read on public.agent_strikes;
create policy agent_strikes_super_admin_read on public.agent_strikes
  for select to authenticated using (private.has_role('super_admin'::public.staff_role));
drop policy if exists agent_commission_holds_super_admin_read on public.agent_commission_holds;
create policy agent_commission_holds_super_admin_read on public.agent_commission_holds
  for select to authenticated using (private.has_role('super_admin'::public.staff_role));
drop policy if exists agent_custody_incidents_super_admin_read on public.agent_custody_incidents;
create policy agent_custody_incidents_super_admin_read on public.agent_custody_incidents
  for select to authenticated using (private.has_role('super_admin'::public.staff_role));

grant select on public.agent_bag_custody, public.agent_strikes,
  public.agent_commission_holds, public.agent_custody_incidents to authenticated;

create or replace function public.sync_agent_bag_custody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'count_confirmed' and old.status is distinct from new.status
     and new.pickup_agent_id is not null then
    insert into public.agent_bag_custody(order_id, pickup_agent_id, picked_up_at)
    values (new.id, new.pickup_agent_id, now())
    on conflict (order_id) do update
      set pickup_agent_id = excluded.pickup_agent_id,
          picked_up_at = coalesce(public.agent_bag_custody.picked_up_at, excluded.picked_up_at),
          updated_at = now();
  end if;

  if new.status = 'received' and old.status is distinct from new.status then
    update public.agent_bag_custody
      set hub_in_at = coalesce(hub_in_at, now()), updated_at = now()
      where order_id = new.id;
  end if;

  if new.status = 'out_for_delivery'
     and (old.status is distinct from new.status or old.delivery_agent_id is distinct from new.delivery_agent_id)
     and new.delivery_agent_id is not null then
    update public.agent_bag_custody
      set delivery_agent_id = new.delivery_agent_id,
          hub_out_at = coalesce(hub_out_at, now()),
          updated_at = now()
      where order_id = new.id and hub_in_at is not null;
  end if;

  if new.status = 'delivered' and old.status is distinct from new.status then
    update public.agent_bag_custody
      set delivered_at = coalesce(delivered_at, new.delivered_at, now()), updated_at = now()
      where order_id = new.id and hub_out_at is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_agent_bag_custody on public.orders;
create trigger orders_agent_bag_custody
after update of status, pickup_agent_id, delivery_agent_id on public.orders
for each row execute function public.sync_agent_bag_custody();
revoke all on function public.sync_agent_bag_custody() from public, anon, authenticated;

create or replace function public.process_agent_custody_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _row record;
  _count integer := 0;
  _desk uuid;
begin
  for _row in
    update public.agent_bag_custody c
      set late_alert_at = now(), updated_at = now()
      where c.picked_up_at <= now() - interval '3 hours'
        and c.hub_in_at is null
        and c.late_alert_at is null
      returning c.order_id, c.pickup_agent_id, c.picked_up_at
  loop
    _count := _count + 1;
    insert into public.order_events(order_id, event, detail)
      values (_row.order_id, 'agent_hub_dropoff_late',
        jsonb_build_object('agent_id', _row.pickup_agent_id, 'picked_up_at', _row.picked_up_at,
          'alerted_at', now(), 'required_within_hours', 3));

    for _desk in
      select distinct ur.user_id
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
      where ur.role in ('secretary'::public.staff_role, 'admin'::public.staff_role, 'super_admin'::public.staff_role)
        and p.status = 'active'
    loop
      insert into public.user_notifications(user_id, title, body, kind, order_id)
        values (_desk, 'Agent bag is overdue at the hub',
          'A paid pickup bag has not been checked in within three hours. Please contact the agent and record the outcome.',
          'agent_custody', _row.order_id);
    end loop;

    if _row.pickup_agent_id is not null then
      insert into public.user_notifications(user_id, title, body, kind, order_id)
        values (_row.pickup_agent_id, 'Hub drop-off overdue',
          'Your collected bag is overdue for hub check-in. Return it to the hub immediately and contact the desk.',
          'agent_custody', _row.order_id);
    end if;
  end loop;
  return _count;
end;
$$;
revoke all on function public.process_agent_custody_alerts() from public, anon, authenticated;
grant execute on function public.process_agent_custody_alerts() to service_role;

do $$
declare _job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into _job using 'agent-custody-watch';
    if _job is null then
      execute 'select cron.schedule($1, $2, $3)'
        into _job using 'agent-custody-watch', '*/15 * * * *',
          'select public.process_agent_custody_alerts();';
    end if;
  end if;
exception when others then
  raise notice 'Agent custody cron was not scheduled automatically: %', sqlerrm;
end;
$$;

create or replace function public.record_agent_strike(
  _agent uuid, _order uuid, _kind text, _note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _strike_count integer;
  _strike_id uuid;
  _agent_name text;
begin
  if auth.uid() is null or not private.is_active() or not private.is_shift_manager() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if _kind not in ('count_skipped','cash_taken','late_drop') then
    raise exception 'invalid_strike_kind';
  end if;
  if length(btrim(coalesce(_note,''))) < 3 then raise exception 'note_required'; end if;
  if not exists (select 1 from public.user_roles where user_id = _agent
      and role in ('delivery_agent'::public.staff_role,'commission_agent'::public.staff_role)) then
    raise exception 'agent_not_found';
  end if;
  if _order is not null and not exists (select 1 from public.orders where id = _order) then
    raise exception 'order_not_found';
  end if;

  perform 1 from public.profiles where id = _agent for update;
  select count(*)::integer + 1 into _strike_count
    from public.agent_strikes where agent_id = _agent;
  _strike_count := least(_strike_count, 3);

  insert into public.agent_strikes(agent_id,order_id,kind,note,strike_number,created_by)
    values (_agent,_order,_kind,left(btrim(_note),1000),_strike_count,auth.uid())
    returning id into _strike_id;

  if _strike_count = 2 then
    insert into public.agent_commission_holds(agent_id,strike_id,starts_at,ends_at,reason)
      values (_agent,_strike_id,now(),now()+interval '14 days','Second process strike: two-week commission hold');
  elsif _strike_count >= 3 then
    update public.profiles set status = 'restricted' where id = _agent;
    update public.staff_profiles set onboarding_status = 'rejected',
      review_note = 'Deactivated after third process strike: ' || left(btrim(_note),700),
      verified_by = null, verified_at = null, updated_at = now()
      where user_id = _agent;
  end if;

  select full_name into _agent_name from public.profiles where id = _agent;
  insert into public.user_notifications(user_id,title,body,kind,order_id)
    values (_agent,
      case _strike_count when 1 then 'Process warning recorded' when 2 then 'Two-week commission hold' else 'Agent access deactivated' end,
      case _strike_count
        when 1 then 'A first process strike has been recorded. This is a warning. Reason: ' || left(btrim(_note),500)
        when 2 then 'A second process strike has been recorded. Commission is held for 14 days. Reason: ' || left(btrim(_note),500)
        else 'A third process strike has been recorded. Your LaundryPoint agent access is deactivated. Contact the office for review.'
      end,
      'agent_discipline',_order);

  if _order is not null then
    insert into public.order_events(order_id,actor_id,event,detail)
      values (_order,auth.uid(),'agent_strike_recorded',
        jsonb_build_object('agent_id',_agent,'strike_id',_strike_id,'kind',_kind,'strike_number',_strike_count));
  end if;
  return jsonb_build_object('strike_id',_strike_id,'strike_number',_strike_count,
    'action',case _strike_count when 1 then 'warning' when 2 then 'commission_hold_14_days' else 'deactivated' end);
end;
$$;
revoke all on function public.record_agent_strike(uuid,uuid,text,text) from public, anon;
grant execute on function public.record_agent_strike(uuid,uuid,text,text) to authenticated;

create or replace function public.record_agent_custody_incident(
  _order uuid, _agent uuid, _leg text, _kind text, _description text, _estimated_value_kobo bigint default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare _id uuid;
begin
  if auth.uid() is null or not private.is_active() or not private.is_shift_manager() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if _leg not in ('pickup','delivery') or _kind not in ('lost','damaged') then raise exception 'invalid_incident'; end if;
  if length(btrim(coalesce(_description,''))) < 3 then raise exception 'note_required'; end if;
  if _estimated_value_kobo is not null and _estimated_value_kobo < 0 then raise exception 'invalid_value'; end if;
  if not exists (select 1 from public.orders where id = _order) then raise exception 'order_not_found'; end if;
  if (_leg = 'pickup' and not exists (select 1 from public.agent_bag_custody where order_id=_order and pickup_agent_id=_agent))
     or (_leg = 'delivery' and not exists (select 1 from public.agent_bag_custody where order_id=_order and delivery_agent_id=_agent)) then
    raise exception 'agent_not_in_custody';
  end if;
  insert into public.agent_custody_incidents(order_id,agent_id,custody_leg,kind,description,estimated_value_kobo,created_by)
    values (_order,_agent,_leg,_kind,left(btrim(_description),2000),_estimated_value_kobo,auth.uid())
    returning id into _id;
  return _id;
end;
$$;
revoke all on function public.record_agent_custody_incident(uuid,uuid,text,text,text,bigint) from public, anon;
grant execute on function public.record_agent_custody_incident(uuid,uuid,text,text,text,bigint) to authenticated;

create or replace function public.resolve_agent_custody_incident(
  _incident uuid, _decision text, _note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('admin'::public.staff_role) and not private.has_role('super_admin'::public.staff_role) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if _decision not in ('liable','not_liable') then raise exception 'invalid_decision'; end if;
  if length(btrim(coalesce(_note,''))) < 3 then raise exception 'note_required'; end if;
  update public.agent_custody_incidents
    set investigation_status=_decision, decision_note=left(btrim(_note),2000),
      resolved_by=auth.uid(), resolved_at=now()
    where id=_incident and investigation_status='open';
  if not found then raise exception 'incident_not_open'; end if;
end;
$$;
revoke all on function public.resolve_agent_custody_incident(uuid,text,text) from public, anon;
grant execute on function public.resolve_agent_custody_incident(uuid,text,text) to authenticated;

-- A second strike blocks both manual approval and payout creation for 14 days.
create or replace function public.guard_agent_commission_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status
     and exists (select 1 from public.agent_commission_holds h
       where h.agent_id = new.agent_id and h.ends_at > now()) then
    raise exception 'agent_commission_hold' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists commissions_agent_hold_guard on public.commissions;
create trigger commissions_agent_hold_guard
before update of status on public.commissions
for each row execute function public.guard_agent_commission_hold();

create or replace function public.guard_agent_payout_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.agent_commission_holds h
      where h.agent_id = new.agent_id and h.ends_at > now()) then
    raise exception 'agent_commission_hold' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists commission_payouts_agent_hold_guard on public.commission_payouts;
create trigger commission_payouts_agent_hold_guard
before insert on public.commission_payouts
for each row execute function public.guard_agent_payout_hold();
revoke all on function public.guard_agent_commission_hold() from public, anon, authenticated;
revoke all on function public.guard_agent_payout_hold() from public, anon, authenticated;

create or replace function public.release_commissions_after_complaint_window()
returns integer language plpgsql security definer set search_path = ''
as $$
declare _n integer;
begin
  update public.commissions c set status='approved',updated_at=now()
  where c.status='pending' and c.payout_id is null and c.release_at is not null
    and c.release_at<=now() and not c.complaint_hold
    and not exists(select 1 from public.agent_commission_holds h where h.agent_id=c.agent_id and h.ends_at>now())
    and not exists(select 1 from public.payments p where p.order_id=c.order_id and p.kind='refund' and p.status='success')
    and not exists(select 1 from public.orders o where o.id=c.order_id and o.status::text in ('disputed','cancelled'))
    and not exists(select 1 from public.order_issues i where i.order_id=c.order_id
      and i.status not in ('resolved','rejected','closed'))
    and not exists(select 1 from public.payment_disputes d where d.order_id=c.order_id
      and d.status not in ('resolved','closed','won'));
  get diagnostics _n=row_count;
  return _n;
end;
$$;
revoke all on function public.release_commissions_after_complaint_window() from public, anon, authenticated;

drop policy if exists agent_bag_custody_assigned_agent_read on public.agent_bag_custody;
create policy agent_bag_custody_assigned_agent_read on public.agent_bag_custody
  for select to authenticated
  using (pickup_agent_id = auth.uid() or delivery_agent_id = auth.uid());

drop policy if exists agent_commission_holds_own_read on public.agent_commission_holds;
create policy agent_commission_holds_own_read on public.agent_commission_holds
  for select to authenticated using (agent_id = auth.uid());

-- Derive the pickup deadline from the configured three-hour limit and the hub's same-day closing time.
alter table public.agent_bag_custody
  add column if not exists hub_dropoff_due_at timestamptz,
  add column if not exists overnight_alert_at timestamptz;

create or replace function public.sync_agent_bag_custody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _hours numeric := 3;
  _tz text := 'Africa/Lagos';
  _closing time;
  _closing_at timestamptz;
  _due timestamptz;
begin
  if new.status = 'count_confirmed' and old.status is distinct from new.status
     and new.pickup_agent_id is not null then
    select coalesce(nullif(value->>'hub_dropoff_hours','')::numeric,3)
      into _hours from public.settings where key='commission';
    select coalesce(value->>'timezone','Africa/Lagos'),
      nullif(value->>'closing_time','')::time
      into _tz,_closing from public.settings where key='business';
    _hours := greatest(0.25,least(coalesce(_hours,3),24));
    _due := now() + _hours * interval '1 hour';
    if _closing is not null then
      _closing_at := ((now() at time zone _tz)::date + _closing) at time zone _tz;
      if _closing_at >= now() then _due := least(_due,_closing_at); end if;
    end if;
    insert into public.agent_bag_custody(order_id,pickup_agent_id,picked_up_at,hub_dropoff_due_at)
      values(new.id,new.pickup_agent_id,now(),_due)
    on conflict(order_id) do update
      set pickup_agent_id=excluded.pickup_agent_id,
          picked_up_at=coalesce(public.agent_bag_custody.picked_up_at,excluded.picked_up_at),
          hub_dropoff_due_at=coalesce(public.agent_bag_custody.hub_dropoff_due_at,excluded.hub_dropoff_due_at),
          updated_at=now();
  end if;
  if new.status='received' and old.status is distinct from new.status then
    update public.agent_bag_custody set hub_in_at=coalesce(hub_in_at,now()),updated_at=now()
      where order_id=new.id;
  end if;
  if new.status='out_for_delivery'
     and (old.status is distinct from new.status or old.delivery_agent_id is distinct from new.delivery_agent_id)
     and new.delivery_agent_id is not null then
    update public.agent_bag_custody set delivery_agent_id=new.delivery_agent_id,
      hub_out_at=coalesce(hub_out_at,now()),updated_at=now()
      where order_id=new.id and hub_in_at is not null;
  end if;
  if new.status='delivered' and old.status is distinct from new.status then
    update public.agent_bag_custody set delivered_at=coalesce(delivered_at,new.delivered_at,now()),updated_at=now()
      where order_id=new.id and hub_out_at is not null;
  end if;
  return new;
end;
$$;

create or replace function public.process_agent_custody_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _row record;
  _count integer := 0;
  _desk uuid;
  _tz text := 'Africa/Lagos';
begin
  select coalesce(value->>'timezone','Africa/Lagos') into _tz
    from public.settings where key='business';

  for _row in
    update public.agent_bag_custody c
      set late_alert_at=now(),updated_at=now()
      where c.picked_up_at is not null and c.hub_in_at is null
        and coalesce(c.hub_dropoff_due_at,c.picked_up_at+interval '3 hours') <= now()
        and c.late_alert_at is null
      returning c.order_id,c.pickup_agent_id,c.picked_up_at,c.hub_dropoff_due_at
  loop
    _count := _count + 1;
    insert into public.order_events(order_id,event,detail)
      values(_row.order_id,'agent_hub_dropoff_late',
        jsonb_build_object('agent_id',_row.pickup_agent_id,'picked_up_at',_row.picked_up_at,
          'due_at',_row.hub_dropoff_due_at,'alerted_at',now()));
    for _desk in
      select distinct ur.user_id from public.user_roles ur
      join public.profiles p on p.id=ur.user_id
      where ur.role in ('secretary'::public.staff_role,'admin'::public.staff_role,'super_admin'::public.staff_role)
        and p.status='active'
    loop
      insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_desk,'Agent bag is overdue at the hub',
          'A paid pickup bag has not been checked in by the required hub drop-off deadline. Please contact the agent and record the outcome.',
          'agent_custody',_row.order_id);
    end loop;
    if _row.pickup_agent_id is not null then
      insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_row.pickup_agent_id,'Hub drop-off overdue',
          'Your collected bag is overdue for hub check-in. Return it to the hub immediately and contact the desk.',
          'agent_custody',_row.order_id);
    end if;
  end loop;

  -- The return-trip bag must not remain with an agent overnight.
  for _row in
    update public.agent_bag_custody c
      set overnight_alert_at=now(),updated_at=now()
      where c.hub_out_at is not null and c.delivered_at is null
        and (c.hub_out_at at time zone _tz)::date < (now() at time zone _tz)::date
        and c.overnight_alert_at is null
      returning c.order_id,c.delivery_agent_id,c.hub_out_at
  loop
    _count := _count + 1;
    insert into public.order_events(order_id,event,detail)
      values(_row.order_id,'agent_bag_overnight',
        jsonb_build_object('agent_id',_row.delivery_agent_id,'hub_out_at',_row.hub_out_at,'alerted_at',now()));
    for _desk in
      select distinct ur.user_id from public.user_roles ur
      join public.profiles p on p.id=ur.user_id
      where ur.role in ('secretary'::public.staff_role,'admin'::public.staff_role,'super_admin'::public.staff_role)
        and p.status='active'
    loop
      insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_desk,'Agent still has an overnight bag',
          'A return-delivery bag signed out from the hub has not been confirmed delivered before the next day. Please investigate immediately.',
          'agent_custody',_row.order_id);
    end loop;
    if _row.delivery_agent_id is not null then
      insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_row.delivery_agent_id,'Return bag is overdue',
          'The bag signed out for delivery is still open after midnight. Contact the hub immediately and complete the return.',
          'agent_custody',_row.order_id);
    end if;
  end loop;
  return _count;
end;
$$;

-- Daily onboarding-volume fraud flag. An open flag automatically holds commission approval and payout.
create table if not exists public.agent_fraud_flags (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id),
  flag_type text not null check (flag_type in ('daily_client_adds','first_order_cancellation_pattern','shared_device','shared_location')),
  flag_day date not null,
  detail text not null,
  status text not null default 'open' check (status in ('open','cleared','dismissed')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists agent_fraud_flags_daily_unique_idx
  on public.agent_fraud_flags(agent_id,flag_type,flag_day);
create index if not exists agent_fraud_flags_open_idx
  on public.agent_fraud_flags(agent_id,status,created_at desc);

alter table public.agent_fraud_flags enable row level security;
revoke all on public.agent_fraud_flags from anon,authenticated;
drop policy if exists agent_fraud_flags_super_admin_read on public.agent_fraud_flags;
create policy agent_fraud_flags_super_admin_read on public.agent_fraud_flags
  for select to authenticated using (private.has_role('super_admin'::public.staff_role));
grant select on public.agent_fraud_flags to authenticated;

create or replace function public.flag_agent_daily_client_adds()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _n integer; _day date;
begin
  _day := (new.created_at at time zone 'Africa/Lagos')::date;
  select count(*)::integer into _n from public.client_invites i
    where i.agent_id=new.agent_id
      and (i.created_at at time zone 'Africa/Lagos')::date=_day
      and i.status in ('invited','signed_up');
  if _n > 10 then
    insert into public.agent_fraud_flags(agent_id,flag_type,flag_day,detail)
      values(new.agent_id,'daily_client_adds',_day,
        'Agent created more than 10 customer invitations on this day ('||_n||'). Review the activity before clearing the commission hold.')
      on conflict(agent_id,flag_type,flag_day) do update
        set detail=excluded.detail,status='open',resolved_by=null,resolved_at=null,resolution_note=null;
  end if;
  return new;
end;
$$;
drop trigger if exists client_invites_daily_agent_flag on public.client_invites;
create trigger client_invites_daily_agent_flag
after insert on public.client_invites
for each row execute function public.flag_agent_daily_client_adds();
revoke all on function public.flag_agent_daily_client_adds() from public,anon,authenticated;

create or replace function public.clear_agent_fraud_flag(_flag uuid,_decision text,_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (private.has_role('admin'::public.staff_role) or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  if _decision not in ('cleared','dismissed') or length(btrim(coalesce(_note,'')))<3 then
    raise exception 'invalid_resolution';
  end if;
  update public.agent_fraud_flags set status=_decision,resolved_by=auth.uid(),
    resolved_at=now(),resolution_note=left(btrim(_note),1000)
    where id=_flag and status='open';
  if not found then raise exception 'fraud_flag_not_open'; end if;
end;
$$;
revoke all on function public.clear_agent_fraud_flag(uuid,text,text) from public,anon;
grant execute on function public.clear_agent_fraud_flag(uuid,text,text) to authenticated;

create or replace function public.guard_agent_commission_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status='approved' and old.status is distinct from new.status and (
    exists(select 1 from public.agent_commission_holds h where h.agent_id=new.agent_id and h.ends_at>now())
    or exists(select 1 from public.agent_fraud_flags f where f.agent_id=new.agent_id and f.status='open')
  ) then
    raise exception 'agent_commission_hold' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function public.guard_agent_payout_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists(select 1 from public.agent_commission_holds h where h.agent_id=new.agent_id and h.ends_at>now())
     or exists(select 1 from public.agent_fraud_flags f where f.agent_id=new.agent_id and f.status='open') then
    raise exception 'agent_commission_hold' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function public.release_commissions_after_complaint_window()
returns integer language plpgsql security definer set search_path = ''
as $$
declare _n integer;
begin
  update public.commissions c set status='approved',updated_at=now()
  where c.status='pending' and c.payout_id is null and c.release_at is not null
    and c.release_at<=now() and not c.complaint_hold
    and not exists(select 1 from public.agent_commission_holds h where h.agent_id=c.agent_id and h.ends_at>now())
    and not exists(select 1 from public.agent_fraud_flags f where f.agent_id=c.agent_id and f.status='open')
    and not exists(select 1 from public.payments p where p.order_id=c.order_id and p.kind='refund' and p.status='success')
    and not exists(select 1 from public.orders o where o.id=c.order_id and o.status::text in ('disputed','cancelled'))
    and not exists(select 1 from public.order_issues i where i.order_id=c.order_id
      and i.status not in ('resolved','rejected','closed'))
    and not exists(select 1 from public.payment_disputes d where d.order_id=c.order_id
      and d.status not in ('resolved','closed','won'));
  get diagnostics _n=row_count;
  return _n;
end;
$$;
revoke all on function public.release_commissions_after_complaint_window() from public,anon,authenticated;

-- Detect when more than half of an agent's referred customers' first orders are cancelled or refunded.
-- The ratio is evaluated only from each customer's first order; admins review and clear the resulting flag.
create or replace function public.flag_agent_first_order_cancellation_pattern(_customer uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  _agent uuid;
  _total integer;
  _bad integer;
  _day date := (now() at time zone 'Africa/Lagos')::date;
begin
  select onboarded_by into _agent from public.profiles where id=_customer;
  if _agent is null then return; end if;
  select count(*)::integer,
    count(*) filter(where firsts.status::text='cancelled' or firsts.refunded)::integer
    into _total,_bad
  from (
    select distinct on(o.customer_id) o.customer_id,o.status,
      exists(select 1 from public.payments p where p.order_id=o.id and p.kind='refund' and p.status='success') as refunded
    from public.orders o
    join public.profiles p on p.id=o.customer_id
    where p.onboarded_by=_agent
    order by o.customer_id,o.created_at,o.id
  ) firsts;
  if _total>0 and _bad*2>_total then
    insert into public.agent_fraud_flags(agent_id,flag_type,flag_day,detail)
      values(_agent,'first_order_cancellation_pattern',_day,
        'More than half of this agent''s referred customers'' first orders are cancelled or refunded ('||_bad||' of '||_total||'). Review the customers and order history.')
      on conflict(agent_id,flag_type,flag_day) do update
        set detail=excluded.detail,status='open',resolved_by=null,resolved_at=null,resolution_note=null;
  end if;
end;
$$;
revoke all on function public.flag_agent_first_order_cancellation_pattern(uuid) from public,anon,authenticated;

create or replace function public.check_agent_first_order_cancellation_from_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status::text='cancelled' and old.status is distinct from new.status then
    perform public.flag_agent_first_order_cancellation_pattern(new.customer_id);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_agent_first_order_fraud on public.orders;
create trigger orders_agent_first_order_fraud
after update of status on public.orders
for each row when (old.status is distinct from new.status and new.status::text='cancelled')
execute function public.check_agent_first_order_cancellation_from_order();
revoke all on function public.check_agent_first_order_cancellation_from_order() from public,anon,authenticated;

create or replace function public.check_agent_first_order_cancellation_from_refund()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _customer uuid;
begin
  if new.kind='refund' and new.status='success'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select customer_id into _customer from public.orders where id=new.order_id;
    if _customer is not null then
      perform public.flag_agent_first_order_cancellation_pattern(_customer);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_agent_first_order_fraud on public.payments;
create trigger payments_agent_first_order_fraud
after insert or update of status on public.payments
for each row execute function public.check_agent_first_order_cancellation_from_refund();
revoke all on function public.check_agent_first_order_cancellation_from_refund() from public,anon,authenticated;

-- Let a verified agent take the return leg only for a customer they personally onboarded.
-- Desk dispatch can still assign a staff delivery agent when the original agent is unavailable.
create or replace function public.claim_own_client_return(_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  if auth.uid() is null or not public.agent_gate() then
    raise exception 'agent_verification_required' using errcode='42501';
  end if;
  select * into _o from public.orders where id=_order for update;
  if not found or _o.pickup_agent_id is distinct from auth.uid()
     or _o.delivery_agent_id is not null
     or _o.status not in ('ready','out_for_delivery') then
    raise exception 'return_job_not_available' using errcode='P0001';
  end if;
  if not exists(select 1 from public.profiles p where p.id=_o.customer_id and p.onboarded_by=auth.uid()) then
    raise exception 'not_own_client' using errcode='42501';
  end if;
  if _o.source <> 'subscription' and _o.fulfillment_choice is distinct from 'deliver' then
    raise exception 'customer_collects_order' using errcode='P0001';
  end if;
  if _o.source <> 'subscription' and not exists(
    select 1 from public.payments p where p.order_id=_order
      and p.purpose='delivery_fare' and p.kind='payment' and p.status='success'
  ) then
    raise exception 'delivery_payment_required' using errcode='P0001';
  end if;
  if private.has_open_dispute(_order) then raise exception 'dispute_open' using errcode='P0001'; end if;

  update public.orders set delivery_agent_id=auth.uid(),
    status=case when status='ready' then 'out_for_delivery'::public.order_status else status end
    where id=_order and delivery_agent_id is null;
  if not found then raise exception 'return_job_not_available' using errcode='P0001'; end if;

  insert into public.user_notifications(user_id,title,body,kind,order_id)
    values(_o.customer_id,'Your agent is bringing your clean clothes',
      'Your LaundryPoint agent has taken responsibility for the return delivery. Do not pay cash.',
      'order_status',_order);
  insert into public.order_events(order_id,actor_id,event,detail)
    values(_order,auth.uid(),'agent_claimed_return_delivery',jsonb_build_object('agent_id',auth.uid()));
end;
$$;
revoke all on function public.claim_own_client_return(uuid) from public,anon;
grant execute on function public.claim_own_client_return(uuid) to authenticated;

-- Automatically route a verified commission-only agent's own customers to that agent.
-- Desk dispatch may replace the pickup or return agent with a staff delivery agent when needed.
create or replace function private.is_verified_commission_agent(_agent uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select _agent is not null
    and exists(select 1 from public.profiles p where p.id=_agent and p.status='active')
    and exists(select 1 from public.user_roles r where r.user_id=_agent and r.role='commission_agent')
    and not exists(select 1 from public.user_roles r where r.user_id=_agent and r.role='delivery_agent')
    and exists(select 1 from public.staff_profiles sp where sp.user_id=_agent and sp.onboarding_status='verified')
    and exists(
      select 1 from public.staff_hub_verifications h
      where h.user_id=_agent and h.outcome='passed'
        and h.person_present and h.nin_document_checked and h.nin_matches_profile and h.photo_matches_person
        and not exists(select 1 from public.staff_hub_verifications later
          where later.user_id=h.user_id and later.verified_at>h.verified_at and later.outcome='rejected')
    );
$$;
revoke all on function private.is_verified_commission_agent(uuid) from public,anon,authenticated;

create or replace function private.assign_commission_agent_pickup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _owner uuid;
begin
  if new.pickup_agent_id is null then
    select onboarded_by into _owner from public.profiles where id=new.customer_id;
    if private.is_verified_commission_agent(_owner) then
      new.pickup_agent_id := _owner;
      if new.status='awaiting_dispatch' then
        new.status := 'agent_assigned';
      end if;
      insert into public.user_notifications(user_id,title,body,kind,order_id)
        values(_owner,'New pickup for your customer',
          'A customer you onboarded has booked a pickup. Check the scheduled time and complete the pickup in your jobs.',
          'job',new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_commission_agent_pickup on public.orders;
create trigger orders_commission_agent_pickup
before insert on public.orders
for each row execute function private.assign_commission_agent_pickup();
revoke all on function private.assign_commission_agent_pickup() from public,anon,authenticated;

create or replace function public.assign_commission_agent_pickup_after_fare()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _o public.orders;
begin
  if new.kind<>'payment' or new.purpose<>'pickup_fare' or new.status<>'success'
     or (tg_op='UPDATE' and old.status='success') or new.order_id is null then
    return new;
  end if;
  select * into _o from public.orders where id=new.order_id for update;
  if not found or _o.pickup_agent_id is null
     or not private.is_verified_commission_agent(_o.pickup_agent_id)
     or _o.status not in ('awaiting_fare_payment','awaiting_dispatch') then
    return new;
  end if;
  update public.orders set status='agent_assigned' where id=_o.id
    and pickup_agent_id=_o.pickup_agent_id
    and status in ('awaiting_fare_payment','awaiting_dispatch');
  return new;
end;
$$;
drop trigger if exists payments_commission_agent_pickup on public.payments;
create trigger payments_commission_agent_pickup
after insert or update of status on public.payments
for each row execute function public.assign_commission_agent_pickup_after_fare();
revoke all on function public.assign_commission_agent_pickup_after_fare() from public,anon,authenticated;
