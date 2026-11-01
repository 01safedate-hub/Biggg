-- Subscription lifecycle automation: daily renewal invoice generation,
-- 5/2/0-day in-app reminders, expiry and period-end cancellation.
-- This migration is aligned to the live production implementation.
create or replace function public.process_subscription_lifecycle()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_sub record; v_invoice public.subscription_invoices; v_created integer:=0; v_reminded integer:=0;
 v_expired integer:=0; v_cancelled integer:=0; v_stage integer; v_days integer; v_body text;
begin
 for v_sub in
  select s.* from public.subscriptions s
   where s.status='active' and not s.cancel_at_period_end and s.current_period_end is not null
    and (s.current_period_end at time zone 'Africa/Lagos')::date
       between (now() at time zone 'Africa/Lagos')::date and (now() at time zone 'Africa/Lagos')::date+5
   order by s.current_period_end for update
 loop
  if not exists(select 1 from public.subscription_invoices i where i.subscription_id=v_sub.id
      and i.period_start=(v_sub.current_period_end at time zone 'Africa/Lagos')::date) then
    insert into public.subscription_invoices(subscription_id,period_start,period_end,amount_kobo,status)
    values(v_sub.id,(v_sub.current_period_end at time zone 'Africa/Lagos')::date,
      ((v_sub.current_period_end+interval '1 month') at time zone 'Africa/Lagos')::date,
      v_sub.price_kobo,'due');
    v_created:=v_created+1;
  end if;
 end loop;
 for v_invoice in
  select i.* from public.subscription_invoices i join public.subscriptions s on s.id=i.subscription_id
   where i.status='due' and i.subscription_pickup_id is null and s.status='active' and not s.cancel_at_period_end
    and i.period_start between (now() at time zone 'Africa/Lagos')::date
                           and (now() at time zone 'Africa/Lagos')::date+5
 loop
  v_days:=v_invoice.period_start-(now() at time zone 'Africa/Lagos')::date;
  v_stage:=case when v_days<=0 then 3 when v_days<=2 then 2 else 1 end;
  if not exists(select 1 from public.order_events e where e.event='subscription_renewal_reminder'
    and e.detail->>'invoice_id'=v_invoice.id::text and e.detail->>'stage'=v_stage::text) then
   v_body:=case v_stage when 1 then 'Your LaundryPoint subscription renewal is due in 5 days.'
     when 2 then 'Your LaundryPoint subscription renewal is due in 2 days.'
     else 'Your LaundryPoint subscription renewal is due today.' end;
   insert into public.user_notifications(user_id,title,body,kind)
    select s.customer_id,'Subscription renewal reminder',v_body,'subscription'
    from public.subscriptions s where s.id=v_invoice.subscription_id;
   insert into public.order_events(event,detail) values('subscription_renewal_reminder',
    jsonb_build_object('invoice_id',v_invoice.id,'stage',v_stage));
   v_reminded:=v_reminded+1;
  end if;
 end loop;
 update public.subscriptions s set status='expired',updated_at=now()
  where s.status='active' and s.current_period_end<=now() and not s.cancel_at_period_end
    and exists(select 1 from public.subscription_invoices i where i.subscription_id=s.id
      and i.period_start=(s.current_period_end at time zone 'Africa/Lagos')::date and i.status='due')
    and not exists(select 1 from public.subscription_invoices i where i.subscription_id=s.id
      and i.period_start=(s.current_period_end at time zone 'Africa/Lagos')::date and i.status='paid');
 get diagnostics v_expired=row_count;
 update public.subscriptions s set status='cancelled',updated_at=now()
  where s.status='active' and s.cancel_at_period_end and s.current_period_end<=now();
 get diagnostics v_cancelled=row_count;
 return jsonb_build_object('renewal_invoices_created',v_created,'reminders_sent',v_reminded,
   'subscriptions_expired',v_expired,'scheduled_cancellations_applied',v_cancelled);
end;
$$;

revoke all on function public.process_subscription_lifecycle() from public, anon, authenticated;
grant execute on function public.process_subscription_lifecycle() to postgres;

select cron.schedule('laundrypoint-subscription-lifecycle-daily','0 6 * * *',
 'select public.process_subscription_lifecycle();');
