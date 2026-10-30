-- Re-evaluate already-delivered orders when a staff member passes the required hub identity check.
-- This preserves eligibility gates and avoids requiring another customer payment or delivery update.
create or replace function public.refresh_commissions_after_hub_verification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _order_id uuid;
begin
  if new.outcome = 'passed'
     and new.person_present
     and new.nin_document_checked
     and new.nin_matches_profile
     and new.photo_matches_person then
    for _order_id in
      select o.id
      from public.orders o
      join public.profiles p on p.id=o.customer_id
      where p.onboarded_by=new.user_id
        and o.delivered_at is not null
    loop
      perform public.refresh_order_commission(_order_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists staff_hub_verification_refresh_commissions on public.staff_hub_verifications;
create trigger staff_hub_verification_refresh_commissions
after insert or update of outcome, person_present, nin_document_checked, nin_matches_profile, photo_matches_person
on public.staff_hub_verifications
for each row execute function public.refresh_commissions_after_hub_verification();

revoke all on function public.refresh_commissions_after_hub_verification() from public, anon, authenticated;