create or replace function public.accrue_order_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _agent uuid;
  _sequence integer;
  _rate numeric(5,4);
  _rules public.commission_rules;
  _basis bigint;
begin
  if new.status <> 'success' or new.order_id is null
     or (tg_op = 'UPDATE' and old.status = 'success') then
    return new;
  end if;

  if new.kind = 'refund' then
    -- Cancel every unpaid payout containing a commission for this refunded order.
    -- Release the other commissions in those batches so they can be paid later.
    with affected_payouts as (
      select distinct c.payout_id
      from public.commissions c
      join public.commission_payouts cp on cp.id = c.payout_id
      where c.order_id = new.order_id
        and c.status in ('pending', 'approved')
        and cp.status in ('pending', 'approved')
        and c.payout_id is not null
    ),
    cancelled as (
      update public.commission_payouts cp
      set status = 'cancelled',
          note = concat_ws(E'\n', nullif(cp.note, ''), 'Cancelled automatically because a commission in this payout was refunded. Recreate payout after review.')
      where cp.id in (select payout_id from affected_payouts)
        and cp.status in ('pending', 'approved')
      returning cp.id
    )
    update public.commissions c
      set payout_id = null, updated_at = now()
    where c.payout_id in (select id from cancelled)
      and c.status = 'approved';

    update public.commissions
      set status = 'reversed',
          review_note = 'Reversed after successful refund payment',
          payout_id = null,
          updated_at = now()
    where order_id = new.order_id
      and status in ('pending', 'approved')
      and (payout_id is null or exists (
        select 1 from public.commission_payouts cp
        where cp.id = commissions.payout_id and cp.status = 'cancelled'
      ));
    return new;
  end if;

  if new.kind <> 'payment' or new.purpose not in ('items', 'extra_clothes') then
    return new;
  end if;

  select p.onboarded_by into _agent
  from public.profiles p
  where p.id = new.customer_id and p.onboarded_by is not null;

  if _agent is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _agent and ur.role = 'commission_agent'
  ) then return new; end if;

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = _agent and sp.onboarding_status = 'verified'
  ) or not exists (
    select 1 from public.staff_hub_verifications h
    where h.user_id = _agent and h.outcome = 'passed'
      and h.person_present and h.nin_document_checked
      and h.nin_matches_profile and h.photo_matches_person
      and not exists (
        select 1 from public.staff_hub_verifications later
        where later.user_id = h.user_id
          and later.verified_at > h.verified_at
          and later.outcome = 'rejected'
      )
  ) then return new; end if;

  select count(distinct o.id)::integer into _sequence
  from public.orders o
  join public.payments p on p.order_id = o.id
    and p.status = 'success' and p.kind = 'payment'
    and p.purpose in ('items', 'extra_clothes') and p.id <> new.id
  where o.customer_id = new.customer_id and o.id <> new.order_id;

  _sequence := _sequence + 1;

  select * into _rules from public.commission_rules
  where active order by updated_at desc limit 1;
  if not found then return new; end if;

  _rate := case when _sequence = 1 then _rules.first_order_rate else _rules.repeat_order_rate end;
  _basis := new.amount_kobo;

  insert into public.commissions(
    agent_id, customer_id, order_id, payment_id, order_sequence, rate, basis_kobo, amount_kobo
  )
  values (
    _agent, new.customer_id, new.order_id, new.id, _sequence,
    _rate, _basis, round(_basis * _rate)::bigint
  )
  on conflict(payment_id) do nothing;

  return new;
end
$function$;