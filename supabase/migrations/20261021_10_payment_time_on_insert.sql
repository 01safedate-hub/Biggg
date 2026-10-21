-- 10: a payment created already successful must get its payment time too (the old guard only ran on update),
-- and the daily view never misses a successful payment even if its time is empty. APPLIED 2026-10-21.
create or replace function private.payments_set_paid_at() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'success' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end $$;
create trigger payments_paid_at_ins before insert on public.payments for each row execute function private.payments_set_paid_at();

-- daily_money_view: purpose breakdowns now use coalesce(paid_at, created_at).
-- (Full function body is in the database; see 09 for the rest of the definition.)
