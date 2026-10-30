-- Hub-first verification for delivery agents. Staff onboarding retains its existing super-admin workflow.

alter table public.staff_profiles
  add column if not exists agent_type text,
  add column if not exists hub_visit_at timestamptz,
  add column if not exists hub_visit_lat double precision,
  add column if not exists hub_visit_lng double precision,
  add column if not exists hub_visit_distance_m integer,
  add column if not exists nin_document_path text,
  add column if not exists face_photo_path text,
  add column if not exists secretary_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists secretary_verified_at timestamptz,
  add column if not exists orientation_completed_at timestamptz,
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists invitation_sent_at timestamptz;

alter table public.staff_profiles drop constraint if exists staff_profiles_agent_type_check;
alter table public.staff_profiles add constraint staff_profiles_agent_type_check
  check (agent_type is null or agent_type in ('staff','commission_only'));

create table if not exists public.agent_orientation_items (
  item_key text primary key,
  label text not null,
  sort_order integer not null unique,
  active boolean not null default true
);
insert into public.agent_orientation_items(item_key,label,sort_order) values
 ('bag_dropoff','Where bags are dropped and how receiving works',1),
 ('handover_codes','Arrival and delivery codes',2),
 ('counting_photos','Counting garments and hard-stain photos',3),
 ('cashless','Never take cash: customers pay in the app',4),
 ('commission','Commission rules and payout timing',5),
 ('agreement','Agent agreement accepted in the app',6)
on conflict(item_key) do update set label=excluded.label,sort_order=excluded.sort_order;

create table if not exists public.agent_orientation_checks (
  agent_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.agent_orientation_items(item_key),
  checked_by uuid not null references auth.users(id),
  checked_at timestamptz not null default now(),
  primary key(agent_id,item_key)
);
alter table public.agent_orientation_items enable row level security;
alter table public.agent_orientation_checks enable row level security;
revoke all on public.agent_orientation_items, public.agent_orientation_checks from anon, authenticated;
grant select on public.agent_orientation_items to authenticated;
grant select on public.agent_orientation_checks to authenticated;
create policy agent_orientation_items_select on public.agent_orientation_items for select to authenticated using (private.is_active());
create policy agent_orientation_checks_select on public.agent_orientation_checks for select to authenticated
 using (agent_id=auth.uid() or private.is_super_admin() or private.has_role('secretary'));

-- The NIN evidence and fresh hub face photo are private in the staff-docs bucket.
-- Keep the legacy generic face photo policy unchanged for existing staff onboarding.
drop policy if exists staff_docs_agent_nin_insert on storage.objects;
create policy staff_docs_agent_nin_insert on storage.objects for insert to authenticated
 with check(bucket_id='staff-docs' and (select private.is_active())
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2]='agent-nin' and private.has_role('delivery_agent'));
drop policy if exists staff_docs_agent_nin_read on storage.objects;
create policy staff_docs_agent_nin_read on storage.objects for select to authenticated
 using(bucket_id='staff-docs' and (select private.is_super_admin())
  and (storage.foldername(name))[2]='agent-nin');

drop policy if exists staff_docs_agent_face_insert on storage.objects;
create policy staff_docs_agent_face_insert on storage.objects for insert to authenticated
 with check(bucket_id='staff-docs' and (select private.is_active())
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2]='hub-face' and private.has_role('delivery_agent'));
drop policy if exists staff_docs_agent_face_read on storage.objects;
create policy staff_docs_agent_face_read on storage.objects for select to authenticated
 using(bucket_id='staff-docs' and ((select private.is_super_admin()) or
  ((storage.foldername(name))[1]=(select auth.uid())::text and private.has_role('delivery_agent'))));

create or replace function public.agent_hub_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare _u uuid:=auth.uid(); _p public.staff_profiles; _items jsonb; _hub record;
begin
 if _u is null or not private.has_role('delivery_agent') then raise exception 'not_agent' using errcode='P0001'; end if;
 select * into _p from public.staff_profiles where user_id=_u;
 select z.centre_lat,z.centre_lng,z.name into _hub from public.zones z join public.staff_profiles sp on sp.station_zone_id=z.id where sp.user_id=_u;
 select coalesce(jsonb_agg(jsonb_build_object('key',i.item_key,'label',i.label,'checked',c.item_key is not null,'checked_at',c.checked_at) order by i.sort_order),'[]'::jsonb)
 into _items from public.agent_orientation_items i left join public.agent_orientation_checks c on c.agent_id=_u and c.item_key=i.item_key where i.active;
 return jsonb_build_object('agent_type',_p.agent_type,'hub_visit_at',_p.hub_visit_at,'hub_distance_m',_p.hub_visit_distance_m,
  'secretary_verified_at',_p.secretary_verified_at,'orientation_completed_at',_p.orientation_completed_at,
  'agreement_accepted_at',_p.agreement_accepted_at,'nin_last4',right(_p.nin,4),'items',_items,
  'hub_lat',_hub.centre_lat,'hub_lng',_hub.centre_lng,'hub_name',_hub.name);
end $$;

create or replace function public.agent_set_nin_document_path(_path text)
returns void language plpgsql security definer set search_path='' as $
begin
 if auth.uid() is null or not private.has_role('delivery_agent') or not private.is_active() then raise exception 'not_agent' using errcode='P0001'; end if;
 if _path is null or left(_path,length(auth.uid()::text)+1) <> auth.uid()::text || '/agent-nin/'
   or not exists(select 1 from storage.objects where bucket_id='staff-docs' and name=_path and owner_id=auth.uid()::text) then
   raise exception 'invalid_nin_document' using errcode='P0001';
 end if;
 update public.staff_profiles set nin_document_path=_path where user_id=auth.uid() and onboarding_status in ('incomplete','rejected','submitted');
 if not found then raise exception 'staff_profile_missing' using errcode='P0001'; end if;
end $;

create or replace function public.agent_confirm_hub_visit(_lat double precision,_lng double precision,_face_photo_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare _hub record; _distance double precision; _p public.staff_profiles;
begin
 if auth.uid() is null or not private.has_role('delivery_agent') or not private.is_active() then raise exception 'not_agent' using errcode='P0001'; end if;
 if _lat is null or _lng is null or abs(_lat)>90 or abs(_lng)>180 then raise exception 'invalid_location' using errcode='P0001'; end if;
 select z.id,z.name,z.centre_lat,z.centre_lng into _hub from public.staff_profiles sp join public.zones z on z.id=sp.station_zone_id where sp.user_id=auth.uid();
 if not found or _hub.centre_lat is null or _hub.centre_lng is null then raise exception 'station_not_configured' using errcode='P0001'; end if;
 _distance:=private.distance_km(_hub.centre_lat::float8,_hub.centre_lng::float8,_lat,_lng)*1000;
 if _distance>150 then raise exception 'outside_hub' using errcode='P0001',detail=round(_distance)::text; end if;
 select * into _p from public.staff_profiles where user_id=auth.uid();
 if _p.nin is null or _p.nin_document_path is null then raise exception 'application_incomplete' using errcode='P0001'; end if;
 if _face_photo_path is null or left(_face_photo_path,length(auth.uid()::text)+1) <> auth.uid()::text || '/hub-face/'
   or not exists(select 1 from storage.objects where bucket_id='staff-docs' and name=_face_photo_path and owner_id=auth.uid()::text) then raise exception 'invalid_face_photo' using errcode='P0001'; end if;
 update public.staff_profiles set hub_visit_at=now(),hub_visit_lat=_lat,hub_visit_lng=_lng,hub_visit_distance_m=round(_distance)::int,
  face_photo_path=_face_photo_path, secretary_verified_at=null,secretary_verified_by=null,orientation_completed_at=null
 where user_id=auth.uid();
 return jsonb_build_object('visited_at',now(),'distance_m',round(_distance));
end $$;

create or replace function public.secretary_verify_agent_identity(_agent uuid,_approved boolean,_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare _p public.staff_profiles;
begin
 if auth.uid() is null or not private.has_role('secretary') or not private.is_active() then raise exception 'not_allowed' using errcode='P0001'; end if;
 select * into _p from public.staff_profiles where user_id=_agent for update;
 if not found or not exists(select 1 from public.user_roles where user_id=_agent and role='delivery_agent') then raise exception 'not_agent' using errcode='P0001'; end if;
 if _approved then
  if _p.hub_visit_at is null or _p.nin_document_path is null or _p.face_photo_path is null then raise exception 'hub_visit_incomplete' using errcode='P0001'; end if;
  update public.staff_profiles set secretary_verified_by=auth.uid(),secretary_verified_at=now(),review_note=null where user_id=_agent;
 else
  if length(trim(coalesce(_note,'')))<3 then raise exception 'note_required' using errcode='P0001'; end if;
  update public.staff_profiles set secretary_verified_by=null,secretary_verified_at=null,review_note=trim(_note) where user_id=_agent;
 end if;
end $$;

create or replace function public.secretary_check_agent_orientation(_agent uuid,_item text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_role('secretary') or not private.is_active() then raise exception 'not_allowed' using errcode='P0001'; end if;
 if not exists(select 1 from public.staff_profiles where user_id=_agent and secretary_verified_at is not null) then raise exception 'identity_not_verified' using errcode='P0001'; end if;
 if not exists(select 1 from public.agent_orientation_items where item_key=_item and active) then raise exception 'invalid_orientation_item' using errcode='P0001'; end if;
 insert into public.agent_orientation_checks(agent_id,item_key,checked_by) values(_agent,_item,auth.uid()) on conflict(agent_id,item_key) do update set checked_by=excluded.checked_by,checked_at=now();
 if not exists(select 1 from public.agent_orientation_items i where i.active and not exists(select 1 from public.agent_orientation_checks c where c.agent_id=_agent and c.item_key=i.item_key)) then
  update public.staff_profiles set orientation_completed_at=now() where user_id=_agent;
 end if;
end $$;

create or replace function public.agent_accept_agreement()
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_role('delivery_agent') or not private.is_active() then raise exception 'not_agent' using errcode='P0001'; end if;
 if not exists(select 1 from public.staff_profiles where user_id=auth.uid() and secretary_verified_at is not null and orientation_completed_at is not null) then raise exception 'orientation_incomplete' using errcode='P0001'; end if;
 update public.staff_profiles set agreement_accepted_at=coalesce(agreement_accepted_at,now()),agreement_version=coalesce(agreement_version,'v1-2026-10-30') where user_id=auth.uid();
end $$;

-- The existing super-admin approval remains the final activation step, but cannot skip the in-person checks for agents.
create or replace function public.verify_staff(_user uuid,_approve boolean,_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_super_admin();
 if not exists(select 1 from public.staff_profiles where user_id=_user) then raise exception 'not_found' using errcode='P0001'; end if;
 if _approve then
  if not private.profile_complete(_user) then raise exception 'profile_incomplete' using errcode='P0001'; end if;
  if exists(select 1 from public.user_roles where user_id=_user and role='delivery_agent') and not exists(select 1 from public.staff_profiles where user_id=_user and hub_visit_at is not null and secretary_verified_at is not null and orientation_completed_at is not null and agreement_accepted_at is not null and nin_document_path is not null and face_photo_path is not null) then
   raise exception 'hub_verification_incomplete' using errcode='P0001';
  end if;
  update public.staff_profiles set onboarding_status='verified',verified_by=auth.uid(),verified_at=now(),review_note=null where user_id=_user;
 else
  if length(trim(coalesce(_note,'')))<3 then raise exception 'note_required' using errcode='P0001'; end if;
  update public.staff_profiles set onboarding_status='rejected',review_note=trim(_note),verified_by=null,verified_at=null where user_id=_user;
 end if;
end $$;

-- Existing agent RPC checks now require the end-to-end approval state in addition to the active role.
create or replace function private.is_verified_agent(_u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select onboarding_status='verified' and hub_visit_at is not null and secretary_verified_at is not null and orientation_completed_at is not null and agreement_accepted_at is not null from public.staff_profiles where user_id=_u),false)
$$;

create or replace function public.agent_gate() returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 return auth.uid() is not null and private.is_active() and private.has_role('delivery_agent') and private.is_verified_agent(auth.uid());
end $$;

create or replace function public.secretary_agent_hub_queue()
returns table(agent_id uuid, full_name text, phone text, onboarding_status text, hub_visit_at timestamptz,
 hub_distance_m integer, secretary_verified_at timestamptz, orientation_completed_at timestamptz,
 agreement_accepted_at timestamptz, nin_last4 text, items jsonb)
language plpgsql stable security definer set search_path='' as $
begin
 if auth.uid() is null or not private.is_active() or not (private.has_role('secretary') or private.is_super_admin()) then
  raise exception 'not_allowed' using errcode='P0001';
 end if;
 return query
 select sp.user_id,pr.full_name,pr.phone,sp.onboarding_status,sp.hub_visit_at,sp.hub_visit_distance_m,
  sp.secretary_verified_at,sp.orientation_completed_at,sp.agreement_accepted_at,right(sp.nin,4),
  coalesce((select jsonb_agg(jsonb_build_object('key',i.item_key,'label',i.label,'checked',c.item_key is not null) order by i.sort_order)
    from public.agent_orientation_items i left join public.agent_orientation_checks c on c.agent_id=sp.user_id and c.item_key=i.item_key where i.active),'[]'::jsonb)
 from public.staff_profiles sp join public.user_roles ur on ur.user_id=sp.user_id and ur.role='delivery_agent'
 join public.profiles pr on pr.id=sp.user_id
 where sp.onboarding_status in ('incomplete','submitted','rejected','verified')
 order by (sp.hub_visit_at is null),sp.hub_visit_at desc nulls last,pr.full_name;
end $;

revoke execute on function public.secretary_agent_hub_queue() from public,anon;
grant execute on function public.secretary_agent_hub_queue() to authenticated;
revoke execute on function public.agent_hub_status(),public.agent_set_nin_document_path(text),public.agent_confirm_hub_visit(double precision,double precision,text),public.secretary_verify_agent_identity(uuid,boolean,text),public.secretary_check_agent_orientation(uuid,text),public.agent_accept_agreement() from public,anon;
grant execute on function public.agent_hub_status(),public.agent_set_nin_document_path(text),public.agent_confirm_hub_visit(double precision,double precision,text),public.secretary_verify_agent_identity(uuid,boolean,text),public.secretary_check_agent_orientation(uuid,text),public.agent_accept_agreement() to authenticated;
revoke execute on function public.verify_staff(uuid,boolean,text) from public,anon;
grant execute on function public.verify_staff(uuid,boolean,text) to authenticated;


-- Do not replace list_agents/assign_pickup_agent here: their active smart-dispatch definitions
-- were applied directly in Supabase and are not source-controlled. They must be inspected and
-- amended in the live project before this migration can be considered deployable.

create or replace function private.agent_order(_order uuid, _states public.order_status[]) returns public.orders language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if auth.uid() is null or not private.is_active() or not private.is_verified_agent(auth.uid()) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.pickup_agent_id is distinct from auth.uid() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not (_o.status = any(_states)) then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  return _o;
end $$;



