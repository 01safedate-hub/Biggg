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
