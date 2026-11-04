-- Keep the pickup follow-up routine callable by its trigger and trusted backend only.
-- Trigger execution is unaffected by revoking direct RPC execution from API roles.
revoke all on function public.create_subscription_pickup_followup() from public;
revoke all on function public.create_subscription_pickup_followup() from anon;
revoke all on function public.create_subscription_pickup_followup() from authenticated;
grant execute on function public.create_subscription_pickup_followup() to service_role;
