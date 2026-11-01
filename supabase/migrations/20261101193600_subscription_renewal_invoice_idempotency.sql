-- Prevent duplicate renewal invoices for the same subscription period.
create unique index if not exists subscription_invoices_one_renewal_per_period
on public.subscription_invoices(subscription_id, period_start)
where subscription_pickup_id is null;
