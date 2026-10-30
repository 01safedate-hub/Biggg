-- Make the admin-configured rates authoritative for commission accrual.
-- first_order_rate is the commission-only agent rate; repeat_order_rate is the salaried delivery staff rate.
-- Existing commission entries remain unchanged.
create or replace function public.refresh_order_commission(_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  _o public.orders;
  _agent uuid;
  _commission_only boolean;
  _rate numeric(5,4);
  _paid_total bigint;
  _eligible_due bigint;
  _payment uuid;
  _sequence integer;
  _rules public.commission_rules;
begin
  select * into _o from public.orders where id = _order;
  if not found or _o.delivered_at is null then return; end if;

  select p.onboarded_by into _agent
  from public.profiles p where p.id = _o.customer_id;
  if _agent is null then return; end if;

  select exists(select 1 from public.user_roles where user_id=_agent and role='commission_agent')
    into _commission_only;

  if _commission_only then
    if exists(select 1 from public.staff_pay where user_id=_agent and active) then return; end if;
  else
    if not exists(select 1 from public.user_roles where user_id=_agent and role='delivery_agent')
       or not exists(select 1 from public.staff_pay where user_id=_agent and active) then return; end if;
  end if;

  if not exists(select 1 from public.staff_profiles where user_id=_agent and onboarding_status='verified')
     or not exists(
       select 1 from public.staff_hub_verifications h
       where h.user_id=_agent and h.outcome='passed' and h.person_present
         and h.nin_document_checked and h.nin_matches_profile and h.photo_matches_person
         and not exists(select 1 from public.staff_hub_verifications later
           where later.user_id=h.user_id and later.verified_at>h.verified_at and later.outcome='rejected')
     ) then return; end if;

  select * into _rules from public.commission_rules where active order by updated_at desc limit 1;
  if not found then return; end if;
  _rate := case when _commission_only then _rules.first_order_rate else _rules.repeat_order_rate end;

  select coalesce(sum(p.amount_kobo),0), (array_agg(p.id order by p.paid_at nulls last,p.created_at))[1]
    into _paid_total, _payment
  from public.payments p
  where p.order_id=_order and p.status='success' and p.kind='payment'
    and p.purpose in ('items','extra_clothes');

  _eligible_due := greatest(coalesce(_o.items_total_kobo,0)-coalesce(_o.discount_kobo,0),0);
  if _eligible_due=0 or _paid_total < _eligible_due or _payment is null then return; end if;

  if exists(select 1 from public.commissions where order_id=_order and status not in ('reversed','rejected')) then
    update public.commissions
      set basis_kobo=_paid_total,
          amount_kobo=round(_paid_total*rate)::bigint,
          delivered_at=_o.delivered_at,
          release_at=_o.delivered_at + interval '48 hours',
          updated_at=now()
    where order_id=_order and status='pending' and payout_id is null;
    return;
  end if;

  select count(distinct old.order_id)::integer+1 into _sequence
  from public.commissions old
  where old.customer_id=_o.customer_id and old.status not in ('reversed','rejected');

  insert into public.commissions(
    agent_id,customer_id,order_id,payment_id,order_sequence,rate,basis_kobo,amount_kobo,status,delivered_at,release_at
  ) values (
    _agent,_o.customer_id,_order,_payment,_sequence,_rate,_paid_total,
    round(_paid_total*_rate)::bigint,'pending',_o.delivered_at,_o.delivered_at+interval '48 hours'
  )
  on conflict do nothing;
end $$;