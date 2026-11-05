-- Complete the referral-to-onboarding status handoff without duplicating sensitive identity data.
alter table public.agent_applications
  add column if not exists invited_at timestamptz,
  add column if not exists invitation_error text;

-- The existing staff onboarding flow is the authoritative application form.
-- Keep the applicant linked to the referral and advance the referral status from that flow.
create or replace function public.sync_agent_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_status = 'submitted' and old.onboarding_status is distinct from new.onboarding_status then
    update public.agent_applications
       set status = 'applied', applied_at = coalesce(applied_at, now()), updated_at = now()
     where applicant_user_id = new.user_id and status = 'referred';
  elsif new.onboarding_status = 'verified' and old.onboarding_status is distinct from new.onboarding_status then
    update public.agent_applications
       set status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now()
     where applicant_user_id = new.user_id and status in ('referred','applied','hub_verified');
  elsif new.onboarding_status = 'rejected' and old.onboarding_status is distinct from new.onboarding_status then
    update public.agent_applications
       set status = 'rejected', updated_at = now(), review_note = coalesce(new.review_note, review_note)
     where applicant_user_id = new.user_id and status in ('referred','applied','hub_verified');
  end if;
  return new;
end
$$;

drop trigger if exists sync_agent_application_status on public.staff_profiles;
create trigger sync_agent_application_status
after update of onboarding_status on public.staff_profiles
for each row execute function public.sync_agent_application_status();

-- Secretary-facing, least-privilege read of applicants awaiting in-person verification.
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
                  order by h.verified_at desc limit 1)
  );
end
$$;
revoke all on function public.secretary_agent_verification_detail(uuid) from public, anon;
grant execute on function public.secretary_agent_verification_detail(uuid) to authenticated;

-- The applicant's own face photo is readable by the secretary only while the linked
-- application is awaiting/undergoing hub verification. NIN and bank data stay in staff_profiles.
drop policy if exists staff_docs_secretary_agent_read on storage.objects;
create policy staff_docs_secretary_agent_read on storage.objects
for select to authenticated
using (
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

-- A successful existing secretary hub-check RPC advances the referral status.
create or replace function public.sync_agent_application_hub_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.outcome = 'passed' then
    update public.agent_applications
       set status = 'hub_verified', hub_verified_at = coalesce(hub_verified_at, new.verified_at), updated_at = now()
     where applicant_user_id = new.user_id and status in ('applied','referred');
  end if;
  return new;
end
$$;
drop trigger if exists sync_agent_application_hub_status on public.staff_hub_verifications;
create trigger sync_agent_application_hub_status
after insert on public.staff_hub_verifications
for each row execute function public.sync_agent_application_hub_status();
