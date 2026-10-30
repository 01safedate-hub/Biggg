-- Commission accrual is order-level and gated on delivery plus full eligible payment.
alter table public.commissions
  add column if not exists delivered_at timestamptz,
  add column if not exists release_at timestamptz,
  add column if not exists complaint_hold boolean not null default false;

-- Production function definitions are installed by this migration. Keep this file as the
-- deployable record of the live migration; use the PR's earlier payroll migration first.
create or replace function public.release_commissions_after_complaint_window()
returns integer language plpgsql security definer set search_path = ''
as $$
declare _n integer;
begin
 update public.commissions c set status='approved',updated_at=now()
 where c.status='pending' and c.payout_id is null and c.release_at is not null
   and c.release_at<=now() and not c.complaint_hold
   and not exists(select 1 from public.payments p where p.order_id=c.order_id and p.kind='refund' and p.status='success')
   and not exists(select 1 from public.orders o where o.id=c.order_id and o.status::text in ('disputed','cancelled'));
 get diagnostics _n=row_count;
 return _n;
end $$;
revoke all on function public.release_commissions_after_complaint_window() from public,anon,authenticated;
grant execute on function public.release_commissions_after_complaint_window() to service_role;
