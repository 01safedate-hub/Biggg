-- Commission-agent hub GPS arrival and restricted NIN-document evidence.
-- Hub coordinates are read from public.zones rows explicitly marked in note as a hub.
create table if not exists public.agent_hub_arrivals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hub_zone_id uuid not null references public.zones(id),
  latitude double precision not null,
  longitude double precision not null,
  distance_m integer not null check (distance_m between 0 and 150),
  checked_at timestamptz not null default now()
);
alter table public.agent_hub_arrivals enable row level security;
revoke all on public.agent_hub_arrivals from public, anon, authenticated;

create or replace function public.check_agent_hub_arrival(_lat double precision, _lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hub record;
  v_distance double precision;
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.is_active()
     or not private.has_role('commission_agent'::public.staff_role) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if _lat is null or _lng is null or abs(_lat) > 90 or abs(_lng) > 180 then
    raise exception 'invalid_location';
  end if;
  if not exists (
    select 1 from public.agent_applications a
    join public.staff_profiles sp on sp.user_id = a.applicant_user_id
    where a.applicant_user_id = v_user
      and a.status in ('applied','hub_verified')
      and sp.onboarding_status = 'submitted'
  ) then
    raise exception 'application_not_ready';
  end if;

  select z.id,z.name,z.centre_lat,z.centre_lng
    into v_hub
    from public.zones z
   where z.is_live
     and z.centre_lat is not null and z.centre_lng is not null
     and not z.coords_approx
     and lower(coalesce(z.note,'')) like '%hub%'
   order by private.distance_km(z.centre_lat,z.centre_lng,_lat,_lng)
   limit 1;
  if not found then raise exception 'hub_location_not_configured'; end if;

  v_distance := private.distance_km(v_hub.centre_lat,v_hub.centre_lng,_lat,_lng) * 1000;
  if v_distance > 150 then
    raise exception 'outside_hub_radius' using errcode='P0001',
      detail = round(v_distance)::text || ' m from ' || v_hub.name;
  end if;

  insert into public.agent_hub_arrivals(user_id,hub_zone_id,latitude,longitude,distance_m,checked_at)
  values(v_user,v_hub.id,_lat,_lng,greatest(0,round(v_distance)::integer),now())
  on conflict(user_id) do update set
    hub_zone_id=excluded.hub_zone_id,latitude=excluded.latitude,longitude=excluded.longitude,
    distance_m=excluded.distance_m,checked_at=excluded.checked_at;

  return jsonb_build_object('ok',true,'hub_name',v_hub.name,'distance_m',greatest(0,round(v_distance)::integer),'checked_at',now());
end
$$;
revoke all on function public.check_agent_hub_arrival(double precision,double precision) from public,anon;
grant execute on function public.check_agent_hub_arrival(double precision,double precision) to authenticated;

create table if not exists public.agent_nin_document_photos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  photo_path text not null,
  captured_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now()
);
alter table public.agent_nin_document_photos enable row level security;
revoke all on public.agent_nin_document_photos from public,anon,authenticated;

-- NIN document files share the private staff-docs bucket, but are never readable by secretaries.
-- The base staff_docs_read policy still grants access to the applicant and super admins only.
drop policy if exists staff_docs_secretary_agent_read on storage.objects;
create policy staff_docs_secretary_agent_read on storage.objects
for select to authenticated
using (
  bucket_id = 'staff-docs'
  and (select private.is_active())
  and (select private.has_role('secretary'::public.staff_role)
       or private.has_role('admin'::public.staff_role)
       or private.has_role('super_admin'::public.staff_role))
  and name not like (storage.foldername(name))[1] || '/nin-document-%'
  and exists (
    select 1 from public.agent_applications a
     where a.applicant_user_id::text = (storage.foldername(name))[1]
       and a.status in ('applied','hub_verified')
  )
);

drop policy if exists staff_docs_secretary_agent_insert on storage.objects;
create policy staff_docs_secretary_agent_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'staff-docs'
  and (select private.is_active())
  and (select private.has_role('secretary'::public.staff_role)
       or private.has_role('admin'::public.staff_role)
       or private.has_role('super_admin'::public.staff_role))
  and exists (
    select 1 from public.agent_applications a
     where a.applicant_user_id::text = (storage.foldername(name))[1]
       and a.status in ('applied','hub_verified')
  )
);

create or replace function public.record_agent_nin_document_photo(_user uuid,_photo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active()
     or not (private.has_role('secretary'::public.staff_role)
          or private.has_role('admin'::public.staff_role)
          or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if not exists(select 1 from public.agent_applications where applicant_user_id=_user and status in ('applied','hub_verified')) then
    raise exception 'application_not_ready';
  end if;
  if _photo_path is null
     or left(_photo_path,length(_user::text)+1) <> _user::text || '/'
     or split_part(_photo_path,'/',2) not like 'nin-document-%'
     or not exists(select 1 from storage.objects where bucket_id='staff-docs' and name=_photo_path) then
    raise exception 'invalid_photo';
  end if;
  insert into public.agent_nin_document_photos(user_id,photo_path,captured_by,captured_at)
  values(_user,_photo_path,auth.uid(),now())
  on conflict(user_id) do update set photo_path=excluded.photo_path,captured_by=excluded.captured_by,captured_at=excluded.captured_at;
end
$$;
revoke all on function public.record_agent_nin_document_photo(uuid,text) from public,anon;
grant execute on function public.record_agent_nin_document_photo(uuid,text) to authenticated;

create or replace function public.super_admin_agent_nin_document(_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active() or not private.is_super_admin() then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  return (select jsonb_build_object('photo_path',p.photo_path,'captured_at',p.captured_at,'captured_by',p.captured_by)
    from public.agent_nin_document_photos p
    join public.agent_applications a on a.applicant_user_id=p.user_id
    where p.user_id=_user);
end
$$;
revoke all on function public.super_admin_agent_nin_document(uuid) from public,anon;
grant execute on function public.super_admin_agent_nin_document(uuid) to authenticated;


-- The secretary cannot mark the in-person check as passed until the applicant has
-- independently confirmed GPS presence within 150 metres of a configured hub zone.
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
    if not exists (select 1 from public.agent_hub_face_photos where user_id = new.user_id) then
      raise exception 'hub_face_photo_required' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.agent_hub_arrivals where user_id = new.user_id) then
      raise exception 'agent_hub_gps_required' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.secretary_agent_verification_detail(_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active()
     or not (private.has_role('secretary'::public.staff_role)
          or private.has_role('admin'::public.staff_role)
          or private.has_role('super_admin'::public.staff_role)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agent_applications a where a.applicant_user_id=_user and a.status in ('applied','hub_verified')) then
    raise exception 'application_not_ready';
  end if;
  return jsonb_build_object(
    'application',(select jsonb_build_object('id',a.id,'full_name',a.full_name,'email',a.email,'phone',a.phone,'status',a.status,'applied_at',a.applied_at) from public.agent_applications a where a.applicant_user_id=_user),
    'profile',(select jsonb_build_object('nin',p.nin,'photo_path',p.photo_path,'home_address',p.home_address,'date_of_birth',p.date_of_birth,'referee_name',p.referee_name,'referee_phone',p.referee_phone,'referee_address',p.referee_address,'referee_relationship',p.referee_relationship) from public.staff_profiles p where p.user_id=_user),
    'latest_hub_check',(select jsonb_build_object('outcome',h.outcome,'person_present',h.person_present,'nin_document_checked',h.nin_document_checked,'nin_matches_profile',h.nin_matches_profile,'photo_matches_person',h.photo_matches_person,'referee_checked',h.referee_checked,'notes',h.notes,'verified_at',h.verified_at) from public.staff_hub_verifications h where h.user_id=_user order by h.verified_at desc limit 1),
    'orientation',(select jsonb_build_object('bags_and_receiving_at',o.bags_and_receiving_at,'arrival_and_delivery_codes_at',o.arrival_and_delivery_codes_at,'counting_and_stain_photos_at',o.counting_and_stain_photos_at,'no_cash_app_payments_at',o.no_cash_app_payments_at,'commission_rules_at',o.commission_rules_at,'completed_by',o.completed_by,'updated_at',o.updated_at) from public.agent_orientation_checklists o where o.user_id=_user),
    'hub_face_photo_path',(select p.photo_path from public.agent_hub_face_photos p where p.user_id=_user),
    'hub_arrival',(select jsonb_build_object('hub_name',z.name,'distance_m',a.distance_m,'checked_at',a.checked_at) from public.agent_hub_arrivals a join public.zones z on z.id=a.hub_zone_id where a.user_id=_user)
  );
end
$$;
