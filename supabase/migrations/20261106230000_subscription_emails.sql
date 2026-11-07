-- Subscriber emails. Every subscription change writes a row to
-- public.subscription_events; this trigger turns the customer-facing ones into
-- a single 'subscription' email template (payload.kind picks the wording).
-- Idempotency: one email per event row. Walk-in and placeholder addresses are skipped.
--
--   kind              when
--   activated         first payment confirmed, or student ID approved
--   under_review      student plan paid, waiting for the ID check
--   id_rejected       student ID rejected (plan cancelled, refund queued)
--   next_term_paid    renewal / plan change paid in advance
--   renewal_due       5 days, 2 days and on the last day, while unpaid
--   renewed           a new term started (also covers a plan change)
--   expired           term ended unpaid
--   cancel_scheduled  customer asked to stop at the end of the term
--   ended             cancelled plan reached its end date
--   extra_bill        a pickup has extra pieces or excluded items to pay for
-- Staff get 'staff_student_id' when an ID is waiting for review.

create or replace function private.subscription_event_emails()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _customer uuid; _email text; _walk boolean; _name text; _sub public.subscriptions; _plan public.plans;
  _inv public.subscription_invoices; _next_plan public.plans; _kind text; _payload jsonb; _pay public.payments; r record;
begin
  _kind := case new.event
    when 'subscription_activated' then 'activated'
    when 'subscription_pending_review' then 'under_review'
    when 'subscription_id_rejected' then 'id_rejected'
    when 'subscription_next_term_paid' then 'next_term_paid'
    when 'subscription_renewal_reminder' then 'renewal_due'
    when 'subscription_renewed' then 'renewed'
    when 'subscription_plan_changed' then 'renewed'
    when 'subscription_expired' then 'expired'
    when 'subscription_cancel_scheduled' then 'cancel_scheduled'
    when 'subscription_cancelled' then 'ended'
    else null end;
  if _kind is null then return null; end if;

  if new.subscription_id is not null then
    select * into _sub from public.subscriptions where id = new.subscription_id;
  end if;
  _customer := coalesce(new.customer_id, _sub.customer_id);
  if _customer is null then return null; end if;
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = _customer;

  if _sub.id is not null then select * into _plan from public.plans where id = _sub.plan_id; end if;
  if new.detail ? 'invoice_id' and nullif(new.detail->>'invoice_id','') is not null then
    select * into _inv from public.subscription_invoices where id = (new.detail->>'invoice_id')::uuid;
    if _inv.id is not null then
      select * into _next_plan from public.plans where id = coalesce(_inv.plan_id, _sub.plan_id);
      select * into _pay from public.payments where invoice_id = _inv.id and kind = 'payment' and status = 'success'
       order by paid_at desc nulls last limit 1;
    end if;
  end if;

  _payload := jsonb_build_object(
    'kind', _kind, 'name', _name,
    'plan', _plan.name, 'pieces', _plan.pieces_per_month, 'pickups', _plan.pickups_per_month,
    'student', coalesce(_plan.requires_student_id, false),
    'period_start', _sub.current_period_start, 'period_end', _sub.current_period_end,
    'billing_period', _sub.billing_period,
    'next_plan', _next_plan.name, 'changed', _next_plan.id is not null and _next_plan.id <> _plan.id,
    'starts_on', _inv.period_start, 'ends_on', _inv.period_end, 'amount_kobo', _inv.amount_kobo,
    'reference', _pay.reference, 'paid_at', _pay.paid_at,
    'stage', (new.detail->>'stage')::integer,
    'reason', new.detail->>'reason', 'refund_kobo', (new.detail->>'refund_kobo')::bigint,
    'after_review', coalesce((new.detail->>'after_review')::boolean, false));

  if _email is not null and _email not like '%.invalid' and not coalesce(_walk, false) then
    insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
    values (_customer, _email, 'subscription', _payload, 'sub-event-' || new.id)
    on conflict (idempotency_key) do nothing;
  end if;

  if _kind = 'under_review' then
    for r in select distinct coalesce(p.email, u.email) as email, p.id, p.full_name
               from public.user_roles ur join public.profiles p on p.id = ur.user_id left join auth.users u on u.id = p.id
              where ur.role in ('admin','super_admin','secretary') and coalesce(p.status, 'active') = 'active'
    loop
      continue when r.email is null or r.email like '%.invalid';
      insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
      values (r.id, r.email, 'staff_student_id',
              jsonb_build_object('name', r.full_name, 'customer', _name, 'plan', _plan.name, 'amount_kobo', _inv.amount_kobo),
              'staff-student-id-' || new.id || '-' || r.id)
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
  return null;
end
$$;
revoke all on function private.subscription_event_emails() from public, anon, authenticated;

drop trigger if exists subscription_events_emails on public.subscription_events;
create trigger subscription_events_emails after insert on public.subscription_events
  for each row execute function private.subscription_event_emails();

-- Extra pieces / excluded items bill after counting.
create or replace function private.subscription_extra_bill_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _sub public.subscriptions; _email text; _walk boolean; _name text; _plan public.plans; _order_no bigint;
begin
  if new.status <> 'collected' or (coalesce(new.overage_kobo,0) + coalesce(new.excluded_kobo,0)) <= 0 then return null; end if;
  if old.status = 'collected' and coalesce(old.overage_kobo,0) = coalesce(new.overage_kobo,0)
     and coalesce(old.excluded_kobo,0) = coalesce(new.excluded_kobo,0) then return null; end if;
  select * into _sub from public.subscriptions where id = new.subscription_id;
  select email, is_walk_in, full_name into _email, _walk, _name from public.profiles where id = _sub.customer_id;
  if _email is null or _email like '%.invalid' or coalesce(_walk, false) then return null; end if;
  select * into _plan from public.plans where id = _sub.plan_id;
  select order_no into _order_no from public.orders where id = new.order_id;
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (_sub.customer_id, _email, 'subscription',
          jsonb_build_object('kind', 'extra_bill', 'name', _name, 'plan', _plan.name, 'order_no', _order_no, 'order_id', new.order_id,
                             'pieces_counted', new.pieces_counted, 'overage_pieces', new.overage_pieces, 'overage_kobo', new.overage_kobo,
                             'excluded_pieces', new.excluded_pieces, 'excluded_kobo', new.excluded_kobo,
                             'amount_kobo', coalesce(new.overage_kobo,0) + coalesce(new.excluded_kobo,0)),
          'sub-extra-' || new.id || '-' || (coalesce(new.overage_kobo,0) + coalesce(new.excluded_kobo,0)))
  on conflict (idempotency_key) do nothing;
  return null;
end
$$;
revoke all on function private.subscription_extra_bill_email() from public, anon, authenticated;

drop trigger if exists subscription_pickups_extra_bill_email on public.subscription_pickups;
create trigger subscription_pickups_extra_bill_email after update of status, overage_kobo, excluded_kobo on public.subscription_pickups
  for each row execute function private.subscription_extra_bill_email();
