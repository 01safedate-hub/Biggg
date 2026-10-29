-- Explicit in-person identity verification at LaundryPoint hub.
-- This audit log never duplicates the NIN value; the NIN remains in staff_profiles.
create table if not exists public.staff_hub_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('passed','rejected')),
  person_present boolean not null,
  nin_document_checked boolean not null,
  nin_matches_profile boolean not null,
  photo_matches_person boolean not null,
  referee_checked boolean not null default false,
  hub_location text not null default 'LaundryPoint hub',
  notes text,
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  check (outcome <> 'passed' or (person_present and nin_document_checked and nin_matches_profile and photo_matches_person))
);
create index if not exists staff_hub_verifications_user_time_idx on public.staff_hub_verifications(user_id, verified_at desc);
alter table public.staff_hub_verifications enable row level security;
revoke all on public.staff_hub_verifications from anon, authenticated;
drop policy if exists "super admins read hub verification" on public.staff_hub_verifications;
create policy "super admins read hub verification" on public.staff_hub_verifications for select to authenticated
  using (private.has_role('super_admin'::public.staff_role));
grant select on public.staff_hub_verifications to authenticated;

create or replace function public.record_staff_hub_verification(
  _user uuid, _outcome text, _person_present boolean, _nin_document_checked boolean,
  _nin_matches_profile boolean, _photo_matches_person boolean, _referee_checked boolean default false,
  _notes text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare _id uuid;
begin
  perform private.require_super_admin();
  if _outcome not in ('passed','rejected') then raise exception 'invalid_outcome'; end if;
  if not exists (select 1 from public.staff_profiles where user_id=_user) then raise exception 'staff_profile_not_found'; end if;
  if _outcome='passed' and not (_person_present and _nin_document_checked and _nin_matches_profile and _photo_matches_person) then
    raise exception 'hub_checks_required';
  end if;
  if _outcome='rejected' and length(trim(coalesce(_notes,'')))<3 then raise exception 'rejection_note_required'; end if;
  insert into public.staff_hub_verifications(user_id,outcome,person_present,nin_document_checked,nin_matches_profile,photo_matches_person,referee_checked,notes,verified_by)
  values (_user,_outcome,_person_present,_nin_document_checked,_nin_matches_profile,_photo_matches_person,coalesce(_referee_checked,false),nullif(btrim(_notes),''),auth.uid())
  returning id into _id;
  if _outcome='passed' then
    update public.staff_profiles set onboarding_status='submitted', verified_by=null, verified_at=null,
      review_note='Hub identity check recorded; awaiting online approval', updated_at=now()
    where user_id=_user;
  elsif _outcome='rejected' then
    update public.staff_profiles set onboarding_status='submitted',verified_by=null,verified_at=null,
      review_note=coalesce(nullif(btrim(_notes),''),'Hub identity verification failed'),updated_at=now() where user_id=_user;
  end if;
  return _id;
end $$;
revoke all on function public.record_staff_hub_verification(uuid,text,boolean,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.record_staff_hub_verification(uuid,text,boolean,boolean,boolean,boolean,boolean,text) to authenticated;

-- Online profile approval is blocked until a successful, current hub check exists.
create or replace function public.verify_staff(_user uuid,_approve boolean,_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare _email text; _name text;
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.staff_profiles where user_id=_user) then raise exception 'not_found' using errcode='P0001'; end if;
  if _approve then
    if not private.profile_complete(_user) then raise exception 'profile_incomplete' using errcode='P0001'; end if;
    if not exists (
      select 1 from public.staff_hub_verifications h where h.user_id=_user and h.outcome='passed'
      and h.person_present and h.nin_document_checked and h.nin_matches_profile and h.photo_matches_person
      and not exists (select 1 from public.staff_hub_verifications later where later.user_id=h.user_id and later.verified_at>h.verified_at and later.outcome='rejected')
    ) then raise exception 'hub_verification_required' using errcode='P0001'; end if;
    update public.staff_profiles set onboarding_status='verified',verified_by=auth.uid(),verified_at=now(),review_note=null,updated_at=now() where user_id=_user;
  else
    if length(trim(coalesce(_note,'')))<3 then raise exception 'note_required' using errcode='P0001'; end if;
    update public.staff_profiles set onboarding_status='rejected',review_note=trim(_note),verified_by=null,verified_at=null,updated_at=now() where user_id=_user;
  end if;
  select u.email,coalesce(p.full_name,'') into _email,_name from auth.users u left join public.profiles p on p.id=u.id where u.id=_user;
  if _email is not null then
    insert into public.email_outbox(user_id,to_email,template,payload,idempotency_key)
    values (_user,_email,'staff_review',jsonb_build_object('approved',_approve,'note',case when _approve then null else trim(_note) end,'name',_name),
      'staff-review-'||_user||'-'||extract(epoch from clock_timestamp())::bigint)
    on conflict (idempotency_key) do nothing;
  end if;
end $$;

-- Keep NIN and hub evidence inside the super-admin-only detail RPC.
create or replace function public.admin_staff_detail(_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.user_roles where user_id=_user) then raise exception 'not_found' using errcode='P0001'; end if;
  return jsonb_build_object(
    'id',_user,
    'person',(select jsonb_build_object('full_name',full_name,'email',email,'phone',phone,'status',status) from public.profiles where id=_user),
    'roles',(select array_agg(role::text order by role) from public.user_roles where user_id=_user),
    'pay',(select to_jsonb(sp)-'user_id' from public.staff_pay sp where user_id=_user),
    'profile',(select to_jsonb(p)-'user_id'-'initial_pw_hash' from public.staff_profiles p where user_id=_user),
    'hub_verification',(select to_jsonb(h) from public.staff_hub_verifications h where h.user_id=_user order by h.verified_at desc, h.id desc limit 1),
    'payouts',coalesce((select jsonb_agg(to_jsonb(w)-'staff_id' order by week_start desc) from public.weekly_payouts w where staff_id=_user),'[]'::jsonb)
  );
end $$;

-- Commission accrual requires both online approval and in-person hub verification.
-- UNIQUE(payment_id) in commissions protects against duplicate payment webhook events.
create or replace function public.accrue_order_commission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _agent uuid; _sequence integer; _rate numeric(5,4); _rules public.commission_rules; _basis bigint;
begin
  if new.status<>'success' or new.order_id is null or (tg_op='UPDATE' and old.status='success') then return new; end if;
  if new.kind='refund' then
    update public.commissions set status='reversed',review_note='Reversed after successful refund payment',updated_at=now()
    where order_id=new.order_id and status in ('pending','approved') and payout_id is null;
    return new;
  end if;
  if new.kind<>'payment' or new.purpose not in ('items','extra_clothes') then return new; end if;
  select p.onboarded_by into _agent from public.profiles p where p.id=new.customer_id and p.onboarded_by is not null;
  if _agent is null or not exists(select 1 from public.user_roles ur where ur.user_id=_agent and ur.role='commission_agent') then return new; end if;
  if not exists(select 1 from public.staff_profiles sp where sp.user_id=_agent and sp.onboarding_status='verified')
    or not exists (
      select 1 from public.staff_hub_verifications h where h.user_id=_agent and h.outcome='passed'
      and h.person_present and h.nin_document_checked and h.nin_matches_profile and h.photo_matches_person
      and not exists(select 1 from public.staff_hub_verifications later where later.user_id=h.user_id and later.verified_at>h.verified_at and later.outcome='rejected')
    ) then return new; end if;
  select count(distinct o.id)::integer into _sequence from public.orders o
    join public.payments p on p.order_id=o.id and p.status='success' and p.kind='payment'
      and p.purpose in ('items','extra_clothes') and p.id<>new.id
    where o.customer_id=new.customer_id and o.id<>new.order_id;
  _sequence:=_sequence+1;
  select * into _rules from public.commission_rules where active order by updated_at desc limit 1;
  if not found then return new; end if;
  _rate:=case when _sequence=1 then _rules.first_order_rate else _rules.repeat_order_rate end;
  _basis:=new.amount_kobo;
  insert into public.commissions(agent_id,customer_id,order_id,payment_id,order_sequence,rate,basis_kobo,amount_kobo)
    values(_agent,new.customer_id,new.order_id,new.id,_sequence,_rate,_basis,round(_basis*_rate)::bigint)
    on conflict(payment_id) do nothing;
  return new;
end $$;
