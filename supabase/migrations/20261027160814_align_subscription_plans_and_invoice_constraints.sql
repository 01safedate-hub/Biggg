-- RECONSTRUCTED SOURCE — not byte-for-byte recovery of the lost original migration.
-- Reconstructed from live production constraint definitions on 2026-10-28.
-- This documents constraints already present in production; do not replay on production.
-- DROP is not used here: this file represents the initial create-only migration form.

alter table public.plans
  add constraint plans_monthly_price_kobo_check
  check (monthly_price_kobo >= 0);

alter table public.plans
  add constraint plans_yearly_discount_pct_check
  check (yearly_discount_pct >= 0 and yearly_discount_pct <= 100);

alter table public.plans
  add constraint plans_pieces_per_month_check
  check (pieces_per_month > 0);

alter table public.plans
  add constraint plans_weekly_allowance_check
  check (weekly_allowance > 0);

alter table public.plans
  add constraint plans_overage_price_kobo_check
  check (overage_price_kobo >= 0);

alter table public.subscription_invoices
  add constraint subscription_invoices_amount_kobo_check
  check (amount_kobo >= 0);

alter table public.subscription_invoices
  add constraint subscription_invoices_status_check
  check (status in ('due', 'paid', 'void'));

alter table public.subscription_invoices
  add constraint subscription_invoices_subscription_pickup_id_fkey
  foreign key (subscription_pickup_id)
  references public.subscription_pickups(id)
  on delete set null;

alter table public.payments
  add constraint payments_invoice_fk
  foreign key (invoice_id)
  references public.subscription_invoices(id)
  on delete set null;
