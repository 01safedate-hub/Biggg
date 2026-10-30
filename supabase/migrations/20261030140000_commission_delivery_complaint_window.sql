-- Commission accrual is order-level: eligible service payments only, after delivery and full payment.
alter table public.commissions
  add column if not exists delivered_at timestamptz,
  add column if not exists release_at timestamptz,
  add column if not exists complaint_hold boolean not null default false;

-- One live commission per order prevents duplicate accrual from repeated/parallel webhooks.
create unique index if not exists commissions_one_live_order_idx
  on public.commissions(order_id)
  where status not in ('reversed','rejected');

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

  -- Commission basis excludes pickup/delivery, demurrage, discounts and other non-service charges.
  select coalesce(sum(p.amount_kobo),0), (array_agg(p.id order by p.paid_at nulls last,p.created_at))[1]
    into _paid_total, _payment
  from public.payments p
  where p.order_id=_order and p.status='success' and p.kind='payment'
    and p.purpose in ('items','extra_clothes');

  _eligible_due := greatest(coalesce(_o.items_total_kobo,0)-coalesce(_o.discount_kobo,0),0);
  if _eligible_due=0 or _paid_total < _eligible_due or _payment is null then return; end if;

  -- Existing row gets corrected to the complete eligible basis when the final partial payment lands.
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

  _rate := case when _commission_only then 0.10 else 0.05 end;

  insert into public.commissions(
    agent_id,customer_id,order_id,payment_id,order_sequence,rate,basis_kobo,amount_kobo,status,delivered_at,release_at
  ) values (
    _agent,_o.customer_id,_order,_payment,_sequence,_rate,_paid_total,
    round(_paid_total*_rate)::bigint,'pending',_o.delivered_at,_o.delivered_at+interval '48 hours'
  )
  on conflict do nothing;
end $$;

create or replace function public.accrue_order_commission()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.order_id is null or new.status <> 'success' then return new; end if;

  if new.kind='refund' then
    -- Cancel unpaid batches affected by the refund, release unrelated approved rows,
    -- then reverse the refunded order's unpaid commission.
    with affected as (
      select distinct c.payout_id from public.commissions c
      join public.commission_payouts cp on cp.id=c.payout_id
      where c.order_id=new.order_id and c.status in ('pending','approved')
        and cp.status in ('pending','approved') and c.payout_id is not null
    ), cancelled as (
      update public.commission_payouts cp set status='cancelled',
        note=concat_ws(E'\\n',nullif(cp.note,''),'Cancelled automatically because a commission in this payout was refunded.')
      where cp.id in (select payout_id from affected) and cp.status in ('pending','approved')
      returning cp.id
    )
    update public.commissions c set payout_id=null,updated_at=now()
    where c.payout_id in (select id from cancelled) and c.order_id<>new.order_id and c.status='approved';

    update public.commissions set status='reversed',
      review_note='Reversed after successful refund payment',payout_id=null,updated_at=now()
    where order_id=new.order_id and status in ('pending','approved') and payout_id is null;
    update public.commissions set complaint_hold=true,
      review_note='Refund received; payout requires admin review',updated_at=now()
    where order_id=new.order_id and status in ('pending','approved') and payout_id is not null;
    return new;
  end if;

  if new.kind='payment' and new.purpose in ('items','extra_clothes') then
    perform public.refresh_order_commission(new.order_id);
  end if;
  return new;
end $$;

create or replace function public.sync_order_commission_delivery()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.delivered_at is not null and (tg_op='INSERT' or old.delivered_at is distinct from new.delivered_at) then
    perform public.refresh_order_commission(new.id);
  end if;
  return new;
end $$;

drop trigger if exists orders_commission_delivery on public.orders;
create trigger orders_commission_delivery after insert or update of delivered_at on public.orders
for each row execute function public.sync_order_commission_delivery();

-- Complaints/issues block release unless closed as resolved/rejected.
create or replace function public.release_commissions_after_complaint_window()
returns integer language plpgsql security definer set search_path = ''
as $$
declare _n integer;
begin
  update public.commissions c set status='approved',updated_at=now()
  where c.status='pending' and c.payout_id is null and c.release_at is not null
    and c.release_at<=now() and not c.complaint_hold
    and not exists(select 1 from public.payments p where p.order_id=c.order_id and p.kind='refund' and p.status='success')
    and not exists(select 1 from public.orders o where o.id=c.order_id and o.status::text in ('disputed','cancelled'))
    and not exists(select 1 from public.order_issues i where i.order_id=c.order_id
      and i.status not in ('resolved','rejected','closed'))
    and not exists(select 1 from public.payment_disputes d where d.order_id=c.order_id
      and d.status not in ('resolved','closed','won'));
  get diagnostics _n=row_count;
  return _n;
end $$;

revoke all on function public.refresh_order_commission(uuid) from public,anon,authenticated;
revoke all on function public.sync_order_commission_delivery() from public,anon,authenticated;
revoke all on function public.release_commissions_after_complaint_window() from public,anon,authenticated;
grant execute on function public.release_commissions_after_complaint_window() to service_role;

-- Keep the existing admin detail contract and append commission ledger information.
create or replace function public.admin_staff_detail(_user uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if not exists(select 1 from public.user_roles where user_id=_user) then
    raise exception 'not_found' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'id',_user,
    'person',(select jsonb_build_object('full_name',full_name,'email',email,'phone',phone,'status',status) from public.profiles where id=_user),
    'roles',(select array_agg(role::text order by role) from public.user_roles where user_id=_user),
    'pay',(select to_jsonb(sp)-'user_id' from public.staff_pay sp where user_id=_user),
    'profile',(select to_jsonb(p)-'user_id'-'initial_pw_hash' from public.staff_profiles p where user_id=_user),
    'hub_verification',(select to_jsonb(h) from public.staff_hub_verifications h where h.user_id=_user order by h.verified_at desc,h.id desc limit 1),
    'payouts',coalesce((select jsonb_agg(to_jsonb(w)-'staff_id' order by week_start desc) from public.weekly_payouts w where staff_id=_user),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'order_id',c.order_id,'rate',c.rate,'amount_kobo',c.amount_kobo,'status',c.status,'delivered_at',c.delivered_at,'release_at',c.release_at,'review_note',c.review_note,'created_at',c.created_at) order by c.created_at desc) from public.commissions c where c.agent_id=_user),'[]'::jsonb)
  );
end $$;

-- Release mature commissions every 15 minutes using the existing pg_cron installation.
select cron.schedule('release-commissions-after-complaint-window','*/15 * * * *',
  'select public.release_commissions_after_complaint_window()')
where not exists(select 1 from cron.job where jobname='release-commissions-after-complaint-window');
