-- Track commission-agent referrals separately from customer referrals.
-- Recruitment does not create a bonus or commission.
create table if not exists public.agent_applications (
  id uuid primary key default gen_random_uuid(),
  referred_by uuid not null references auth.users(id) on delete restrict,
  applicant_user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  email text not null,
  phone text not null,
  status text not null default 'referred'
    check (status in ('referred','applied','hub_verified','approved','rejected')),
  referred_at timestamptz not null default now(),
  applied_at timestamptz,
  hub_verified_at timestamptz,
  approved_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_applications_referrer_time_idx
  on public.agent_applications(referred_by, created_at desc);
create index if not exists agent_applications_status_time_idx
  on public.agent_applications(status, created_at desc);
create unique index if not exists agent_applications_open_email_uidx
  on public.agent_applications(lower(email))
  where status in ('referred','applied','hub_verified','approved');
alter table public.agent_applications enable row level security;
revoke all on public.agent_applications from anon, authenticated;
create policy "referrers and staff read agent applications"
  on public.agent_applications for select to authenticated
  using (
    referred_by = (select auth.uid())
    or private.has_role('secretary'::public.staff_role)
    or private.has_role('admin'::public.staff_role)
    or private.has_role('super_admin'::public.staff_role)
  );
grant select on public.agent_applications to authenticated;

create or replace function public.create_agent_referral(_full_name text, _email text, _phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare _id uuid; v_email text := lower(btrim(coalesce(_email,''))); v_name text := btrim(coalesce(_full_name,'')); v_phone text := btrim(coalesce(_phone,''));
begin
  if auth.uid() is null or not private.is_active()
    or not (private.has_role('commission_agent'::public.staff_role) or private.has_role('delivery_agent'::public.staff_role)) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if length(v_name) < 2 or length(_name) > 80 then raise exception 'invalid_name'; end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'invalid_email'; end if;
  if length(regexp_replace(v_phone,'[^0-9]','','g')) not between 10 and 15 then raise exception 'invalid_phone'; end if;
  if exists(select 1 from auth.users u where lower(u.email)=v_email) then raise exception 'account_already_exists'; end if;
  insert into public.agent_applications(referred_by,full_name,email,phone)
  values(auth.uid(),v_name,v_email,v_phone)
  returning id into _id;
  return _id;
exception when unique_violation then
  raise exception 'agent_already_referred';
end
$$;
revoke all on function public.create_agent_referral(text,text,text) from public, anon;
grant execute on function public.create_agent_referral(text,text,text) to authenticated;
