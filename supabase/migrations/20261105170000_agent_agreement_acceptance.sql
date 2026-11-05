-- Versioned commission-agent agreement acceptance.
-- Draft wording is presented in the app as an interim operating agreement pending legal review.
create table if not exists public.agent_agreement_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agreement_version text not null,
  accepted_at timestamptz not null default now()
);
alter table public.agent_agreement_acceptances enable row level security;
revoke all on public.agent_agreement_acceptances from public, anon, authenticated;

create or replace function public.my_agent_agreement_accepted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agent_agreement_acceptances a
    where a.user_id = auth.uid()
      and a.agreement_version = '2026-11-05-v1'
  )
$$;
revoke all on function public.my_agent_agreement_accepted() from public, anon;
grant execute on function public.my_agent_agreement_accepted() to authenticated;

create or replace function public.accept_agent_agreement(_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active()
     or not private.has_role('commission_agent'::public.staff_role) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if _version is distinct from '2026-11-05-v1' then
    raise exception 'agreement_version_invalid';
  end if;
  if not exists (
    select 1 from public.agent_applications
    where applicant_user_id = auth.uid()
      and status in ('referred','applied')
  ) then
    raise exception 'agent_application_not_found';
  end if;
  insert into public.agent_agreement_acceptances(user_id,agreement_version,accepted_at)
  values(auth.uid(),_version,now())
  on conflict(user_id) do update
    set agreement_version=excluded.agreement_version,accepted_at=excluded.accepted_at;
end
$$;
revoke all on function public.accept_agent_agreement(text) from public, anon;
grant execute on function public.accept_agent_agreement(text) to authenticated;

create or replace function public.require_agent_agreement_before_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_status = 'submitted'
     and old.onboarding_status is distinct from new.onboarding_status
     and private.has_role('commission_agent'::public.staff_role)
     and not exists (
       select 1 from public.agent_agreement_acceptances a
       where a.user_id = new.user_id
         and a.agreement_version = '2026-11-05-v1'
     ) then
    raise exception 'agent_agreement_required' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists require_agent_agreement_before_submit on public.staff_profiles;
create trigger require_agent_agreement_before_submit
before update of onboarding_status on public.staff_profiles
for each row execute function public.require_agent_agreement_before_submit();
