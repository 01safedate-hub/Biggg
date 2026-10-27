-- Subscription payment intent RPCs expose no public functionality and must be called only by authenticated customers.
revoke execute on function public.create_subscription_payment_intent(text,text) from anon, public;
grant execute on function public.create_subscription_payment_intent(text,text) to authenticated;

revoke execute on function public.create_extra_clothes_payment_intent(uuid,text) from anon, public;
grant execute on function public.create_extra_clothes_payment_intent(uuid,text) to authenticated;
