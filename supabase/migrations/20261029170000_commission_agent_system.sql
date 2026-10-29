-- Commission-agent system: distinct role, configurable rates, immutable accrual source, review and payout tracking.
do $$ begin
  alter type public.staff_role add value if not exists 'commission_agent';
exception when duplicate_object then null;
end $$;

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  first_order_rate numeric(5,4) not null default 0.15 check (first_order_rate >= 0 and first_order_rate <= 1),
  repeat_order_rate numeric(5,4) not null default 0.10 check (repeat_order_rate >= 0 and repeat_order_rate <= 1),
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.commission_rules(first_order_rate, repeat_order_rate)
select 0.15, 0.10 where not exists (select 1 from public.commission_rules);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id),
  customer_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  order_sequence integer not null check (order_sequence > 0),
  rate numeric(5,4) not null check (rate >= 0 and rate <= 1),
  basis_kobo bigint not null check (basis_kobo >= 0),
  amount_kobo bigint not null check (amount_kobo >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid','reversed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  payout_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id)
);
create index if not exists commissions_agent_status_created_idx on public.commissions(agent_id,status,created_at desc);
create index if not exists commissions_order_idx on public.commissions(order_id);

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id),
  period_start date not null,
  period_end date not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  payment_method text,
  payment_reference text,
  note text,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  paid_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
alter table public.commissions drop constraint if exists commissions_payout_id_fkey;
alter table public.commissions add constraint commissions_payout_id_fkey foreign key (payout_id) references public.commission_payouts(id);
create index if not exists commission_payouts_agent_period_idx on public.commission_payouts(agent_id,period_start desc);

alter table public.commission_rules enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_payouts enable row level security;
drop policy if exists "commission rules read for staff" on public.commission_rules;
create policy "commission rules read for staff" on public.commission_rules for select to authenticated using (private.is_active() and private.has_role(array['commission_agent','delivery_agent','admin','super_admin']::public.staff_role[]));
drop policy if exists "commission agent reads own commissions" on public.commissions;
create policy "commission agent reads own commissions" on public.commissions for select to authenticated using (agent_id = auth.uid() or private.has_role(array['admin','super_admin']::public.staff_role[]));
drop policy if exists "commission agent reads own payouts" on public.commission_payouts;
create policy "commission agent reads own payouts" on public.commission_payouts for select to authenticated using (agent_id = auth.uid() or private.has_role(array['admin','super_admin']::public.staff_role[]));
revoke all on public.commission_rules, public.commissions, public.commission_payouts from anon, authenticated;
grant select on public.commission_rules, public.commissions, public.commission_payouts to authenticated;

create or replace function public.accrue_order_commission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _agent uuid;
  _sequence integer;
  _rate numeric(5,4);
  _rules public.commission_rules;
  _basis bigint;
begin
  if new.status <> 'success' or new.kind <> 'payment' or new.order_id is null
     or (tg_op = 'UPDATE' and old.status = 'success') then
    return new;
  end if;
  -- Only paid service charges earn commission; transport, demurrage and refunds do not.
  if new.purpose not in ('items','extra_clothes') then return new; end if;
  select p.onboarded_by into _agent from public.profiles p
    where p.id = new.customer_id and p.onboarded_by is not null;
  if _agent is null or not exists (
    select 1 from public.user_roles ur where ur.user_id = _agent and ur.role = 'commission_agent'
  ) then return new; end if;
  select count(*)::integer into _sequence
    from public.orders o
    join public.payments p on p.order_id = o.id and p.status = 'success' and p.kind = 'payment'
      and p.purpose in ('items','extra_clothes') and p.id <> new.id
    where o.customer_id = new.customer_id;
  _sequence := _sequence + 1;
  select * into _rules from public.commission_rules where active order by updated_at desc limit 1;
  if not found then return new; end if;
  _rate := case when _sequence = 1 then _rules.first_order_rate else _rules.repeat_order_rate end;
  _basis := new.amount_kobo;
  insert into public.commissions(agent_id,customer_id,order_id,payment_id,order_sequence,rate,basis_kobo,amount_kobo)
  values (_agent,new.customer_id,new.order_id,new.id,_sequence,_rate,_basis,round(_basis * _rate)::bigint)
  on conflict(payment_id) do nothing;
  return new;
end $$;

drop trigger if exists payments_accrue_commission on public.payments;
create trigger payments_accrue_commission
after insert or update of status on public.payments
for each row execute function public.accrue_order_commission();

create or replace function public.review_commission(_commission uuid, _decision text, _note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role(array['admin','super_admin']::public.staff_role[]) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if _decision not in ('approved','rejected','reversed') then raise exception 'invalid_decision'; end if;
  update public.commissions set status = _decision, reviewed_by = auth.uid(),
    reviewed_at = now(), review_note = nullif(btrim(_note),''),
    updated_at = now()
  where id = _commission and status = 'pending';
  if not found then raise exception 'commission_not_pending'; end if;
end $$;

create or replace function public.create_commission_payout(_agent uuid, _from date, _to date, _note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare _id uuid; _amount bigint;
begin
  if not private.has_role(array['admin','super_admin']::public.staff_role[]) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if _to < _from then raise exception 'invalid_period'; end if;
  perform 1 from public.user_roles where user_id = _agent and role = 'commission_agent';
  if not found then raise exception 'not_commission_agent'; end if;
  select coalesce(sum(amount_kobo),0)::bigint into _amount from public.commissions
    where agent_id = _agent and status = 'approved' and payout_id is null
      and created_at::date between _from and _to for update;
  if _amount <= 0 then raise exception 'no_approved_commissions'; end if;
  insert into public.commission_payouts(agent_id,period_start,period_end,amount_kobo,note,created_by)
    values (_agent,_from,_to,_amount,nullif(btrim(_note),''),auth.uid()) returning id into _id;
  update public.commissions set payout_id = _id, updated_at = now()
    where agent_id = _agent and status = 'approved' and payout_id is null and created_at::date between _from and _to;
  return _id;
end $$;

create or replace function public.update_commission_payout(_payout uuid, _action text, _method text default null, _reference text default null, _note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare _status text;
begin
  if not private.has_role(array['admin','super_admin']::public.staff_role[]) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select status into _status from public.commission_payouts where id = _payout for update;
  if not found then raise exception 'payout_not_found'; end if;
  if _action = 'approve' and _status = 'pending' then
    update public.commission_payouts set status='approved', approved_by=auth.uid(), approved_at=now(), note=coalesce(nullif(btrim(_note),''),note) where id=_payout;
  elsif _action = 'mark_paid' and _status = 'approved' then
    if nullif(btrim(_method),'') is null or nullif(btrim(_reference),'') is null then raise exception 'payment_method_and_reference_required'; end if;
    update public.commission_payouts set status='paid', payment_method=_method, payment_reference=_reference,
      paid_by=auth.uid(), paid_at=now(), note=coalesce(nullif(btrim(_note),''),note) where id=_payout;
    update public.commissions set status='paid', updated_at=now() where payout_id=_payout and status='approved';
  else raise exception 'invalid_payout_transition'; end if;
end $$;
revoke all on function public.accrue_order_commission() from public, anon, authenticated;
revoke all on function public.review_commission(uuid,text,text) from public, anon;
revoke all on function public.create_commission_payout(uuid,date,date,text) from public, anon;
revoke all on function public.update_commission_payout(uuid,text,text,text,text) from public, anon;
grant execute on function public.review_commission(uuid,text,text) to authenticated;
grant execute on function public.create_commission_payout(uuid,date,date,text) to authenticated;
grant execute on function public.update_commission_payout(uuid,text,text,text,text) to authenticated;
