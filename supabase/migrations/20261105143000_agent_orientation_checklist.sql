-- Track the five in-person commission-agent orientation topics individually.
create table if not exists public.agent_orientation_checklists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bags_and_receiving_at timestamptz,
  arrival_and_delivery_codes_at timestamptz,
  counting_and_stain_photos_at timestamptz,
  no_cash_app_payments_at timestamptz,
  commission_rules_at timestamptz,
  completed_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.agent_orientation_checklists enable row level security;
revoke all on public.agent_orientation_checklists from public, anon, authenticated;

create or replace function public.record_agent_orientation(
  _user uuid,
  _bags_and_receiving boolean,
  _arrival_and_delivery_codes boolean,
  _counting_and_stain_photos boolean,
  _no_cash_app_payments boolean,
  _commission_rules boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare _now timestamptz := now();
begin
  if auth.uid() is null or not private.is_active()
     or not (private.has_role('secretary'::public.staff_role)
          or private.has_role('admin'::public.staff_role)
          or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agent_applications where applicant_user_id = _user and status in ('applied','hub_verified')) then
    raise exception 'application_not_ready';
  end if;
  insert into public.agent_orientation_checklists(
    user_id,bags_and_receiving_at,arrival_and_delivery_codes_at,counting_and_stain_photos_at,
    no_cash_app_payments_at,commission_rules_at,completed_by,updated_at
  ) values (
    _user,
    case when coalesce(_bags_and_receiving,false) then _now end,
    case when coalesce(_arrival_and_delivery_codes,false) then _now end,
    case when coalesce(_counting_and_stain_photos,false) then _now end,
    case when coalesce(_no_cash_app_payments,false) then _now end,
    case when coalesce(_commission_rules,false) then _now end,
    auth.uid(),_now
  )
  on conflict (user_id) do update set
    bags_and_receiving_at = case when coalesce(_bags_and_receiving,false) then coalesce(agent_orientation_checklists.bags_and_receiving_at,_now) else null end,
    arrival_and_delivery_codes_at = case when coalesce(_arrival_and_delivery_codes,false) then coalesce(agent_orientation_checklists.arrival_and_delivery_codes_at,_now) else null end,
    counting_and_stain_photos_at = case when coalesce(_counting_and_stain_photos,false) then coalesce(agent_orientation_checklists.counting_and_stain_photos_at,_now) else null end,
    no_cash_app_payments_at = case when coalesce(_no_cash_app_payments,false) then coalesce(agent_orientation_checklists.no_cash_app_payments_at,_now) else null end,
    commission_rules_at = case when coalesce(_commission_rules,false) then coalesce(agent_orientation_checklists.commission_rules_at,_now) else null end,
    completed_by = auth.uid(), updated_at = _now;
end
$$;
revoke all on function public.record_agent_orientation(uuid,boolean,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.record_agent_orientation(uuid,boolean,boolean,boolean,boolean,boolean) to authenticated;

-- A commission-agent hub check cannot pass until every orientation topic has been recorded.
create or replace function public.require_agent_orientation_before_hub_pass()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.outcome = 'passed'
     and exists (select 1 from public.agent_applications where applicant_user_id = new.user_id) then
    if not exists (
      select 1 from public.agent_orientation_checklists o
       where o.user_id = new.user_id
         and o.bags_and_receiving_at is not null
         and o.arrival_and_delivery_codes_at is not null
         and o.counting_and_stain_photos_at is not null
         and o.no_cash_app_payments_at is not null
         and o.commission_rules_at is not null
    ) then
      raise exception 'agent_orientation_incomplete' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists require_agent_orientation_before_hub_pass on public.staff_hub_verifications;
create trigger require_agent_orientation_before_hub_pass
before insert on public.staff_hub_verifications
for each row execute function public.require_agent_orientation_before_hub_pass();

create or replace function public.secretary_agent_verification_detail(_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active()
     or not (private.has_role('secretary'::public.staff_role)
          or private.has_role('admin'::public.staff_role)
          or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.agent_applications a
     where a.applicant_user_id = _user and a.status in ('applied','hub_verified')
  ) then
    raise exception 'application_not_ready';
  end if;
  return jsonb_build_object(
    'application', (select jsonb_build_object('id',a.id,'full_name',a.full_name,'email',a.email,'phone',a.phone,'status',a.status,'applied_at',a.applied_at)
                      from public.agent_applications a where a.applicant_user_id = _user),
    'profile', (select jsonb_build_object('nin',p.nin,'photo_path',p.photo_path,'home_address',p.home_address,
                 'date_of_birth',p.date_of_birth,'referee_name',p.referee_name,'referee_phone',p.referee_phone,
                 'referee_address',p.referee_address,'referee_relationship',p.referee_relationship)
                  from public.staff_profiles p where p.user_id = _user),
    'latest_hub_check', (select jsonb_build_object('outcome',h.outcome,'person_present',h.person_present,
                 'nin_document_checked',h.nin_document_checked,'nin_matches_profile',h.nin_matches_profile,
                 'photo_matches_person',h.photo_matches_person,'referee_checked',h.referee_checked,
                 'notes',h.notes,'verified_at',h.verified_at)
                  from public.staff_hub_verifications h where h.user_id = _user
                  order by h.verified_at desc limit 1),
    'orientation', (select jsonb_build_object(
                 'bags_and_receiving_at',o.bags_and_receiving_at,
                 'arrival_and_delivery_codes_at',o.arrival_and_delivery_codes_at,
                 'counting_and_stain_photos_at',o.counting_and_stain_photos_at,
                 'no_cash_app_payments_at',o.no_cash_app_payments_at,
                 'commission_rules_at',o.commission_rules_at,
                 'completed_by',o.completed_by,'updated_at',o.updated_at)
                  from public.agent_orientation_checklists o where o.user_id = _user)
  );
end
$$;
