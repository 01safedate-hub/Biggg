-- Customs: business and student-lodge accounts with an agreed rate card, members, and a PREPAID balance.
--
-- * A custom is a Plan (weekly or monthly fee with an allowance per category; extra pieces charged at the rate)
--   or One-time (every batch charged at the rate; "Repeat" starts another batch).
-- * Money: the business tops up a balance (desk records cash / transfer / POS as a payment, purpose custom_deposit).
--   Plan fees and batch charges are taken from that balance. Nothing is post-paid: a batch cannot be confirmed
--   unless the balance covers it.
-- * Batches are ordinary orders (source 'custom') so they use the wash queue, shelves, delivery and the Orders tab.
--   Their lines carry the member and category and are priced 0 on the order: the charge lives in the custom ledger,
--   so it never touches order payments, receipts or agent commission.
-- * The manager (must have a LaundryPoint account) confirms a whole batch; each member can confirm their own items.
--   When every member with items has confirmed, the batch is confirmed too.
-- * Admin (settings.customs_admin, default the weekly-target owner) is emailed when a custom is created and when a
--   batch is entered. Third-party emails get a read-only link.

alter table public.orders drop constraint orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source = any (array['online', 'walk_in', 'whatsapp', 'subscription', 'one_time', 'custom']));
alter table public.payments drop constraint payments_purpose_check;
alter table public.payments add constraint payments_purpose_check
  check (purpose = any (array['pickup_fare', 'delivery_fare', 'items', 'subscription', 'extra_clothes', 'demurrage', 'other', 'custom_deposit']));

create table public.customs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  code text not null unique check (code ~ '^[A-Z]{3}[0-9]{0,2}$'),
  kind text not null check (kind in ('business', 'lodge')),
  mode text not null check (mode in ('plan', 'one_time')),
  manager_id uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  delivery text not null default 'collect' check (delivery in ('collect', 'deliver')),
  address text check (length(address) <= 200),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  period text check (period in ('weekly', 'monthly')),
  period_fee_kobo bigint not null default 0 check (period_fee_kobo >= 0),
  period_start date,
  period_end date,
  notes text check (length(notes) <= 500),
  share_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'plan') = (period is not null)),
  check (delivery = 'collect' or (address is not null and lat is not null and lng is not null))
);

create table public.custom_rates (
  custom_id uuid not null references public.customs(id) on delete cascade,
  category_id uuid not null references public.item_categories(id),
  unit text not null check (unit in ('piece', 'kg', 'bag', 'set')),
  price_kobo bigint not null check (price_kobo >= 0),
  allowance integer check (allowance >= 0),
  primary key (custom_id, category_id)
);

create table public.custom_members (
  id uuid primary key default gen_random_uuid(),
  custom_id uuid not null references public.customs(id) on delete cascade,
  seq integer not null,
  tag text not null unique,
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  phone text check (length(phone) <= 20),
  email text check (length(email) <= 120),
  user_id uuid references public.profiles(id),
  active boolean not null default true,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (custom_id, seq)
);
create index custom_members_user on public.custom_members (user_id) where user_id is not null;

create table public.custom_watchers (
  id uuid primary key default gen_random_uuid(),
  custom_id uuid not null references public.customs(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 120),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index custom_watchers_uq on public.custom_watchers (custom_id, lower(email));

create table public.custom_ledger (
  id uuid primary key default gen_random_uuid(),
  custom_id uuid not null references public.customs(id),
  kind text not null check (kind in ('deposit', 'plan_fee', 'batch', 'adjust')),
  amount_kobo bigint not null check (amount_kobo <> 0),
  order_id uuid references public.orders(id),
  payment_id uuid references public.payments(id),
  period_start date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((kind = 'deposit') = (payment_id is not null)),
  check (kind not in ('deposit') or amount_kobo > 0),
  check (kind not in ('plan_fee', 'batch') or amount_kobo < 0)
);
create index custom_ledger_custom on public.custom_ledger (custom_id, created_at);
create unique index custom_ledger_one_batch_charge on public.custom_ledger (order_id) where kind = 'batch';
create unique index custom_ledger_one_period_fee on public.custom_ledger (custom_id, period_start) where kind = 'plan_fee';

alter table public.orders add column custom_id uuid references public.customs(id);
create index orders_custom on public.orders (custom_id) where custom_id is not null;
alter table public.order_items add column custom_member_id uuid references public.custom_members(id);
alter table public.order_items add column custom_category_id uuid references public.item_categories(id);

create table public.custom_batches (
  order_id uuid primary key references public.orders(id) on delete cascade,
  custom_id uuid not null references public.customs(id),
  period_start date,
  charge_kobo bigint not null default 0 check (charge_kobo >= 0),
  breakdown jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  confirmed_via text check (confirmed_via in ('manager', 'members')),
  confirmed_by uuid references public.profiles(id),
  charged_at timestamptz,
  created_at timestamptz not null default now()
);
create index custom_batches_custom on public.custom_batches (custom_id, created_at);

create table public.custom_member_confirmations (
  order_id uuid not null references public.orders(id) on delete cascade,
  member_id uuid not null references public.custom_members(id),
  user_id uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  primary key (order_id, member_id)
);

-- Everything is read through the functions below; staff may also read the tables directly.
alter table public.customs enable row level security;
alter table public.custom_rates enable row level security;
alter table public.custom_members enable row level security;
alter table public.custom_watchers enable row level security;
alter table public.custom_ledger enable row level security;
alter table public.custom_batches enable row level security;
alter table public.custom_member_confirmations enable row level security;
create policy customs_staff_read on public.customs for select to authenticated using ((select private.is_money_staff()));
create policy custom_rates_staff_read on public.custom_rates for select to authenticated using ((select private.is_money_staff()));
create policy custom_members_staff_read on public.custom_members for select to authenticated using ((select private.is_money_staff()));
create policy custom_watchers_staff_read on public.custom_watchers for select to authenticated using ((select private.is_money_staff()));
create policy custom_ledger_staff_read on public.custom_ledger for select to authenticated using ((select private.is_money_staff()));
create policy custom_batches_staff_read on public.custom_batches for select to authenticated using ((select private.is_money_staff()));
create policy custom_member_confirmations_staff_read on public.custom_member_confirmations for select to authenticated using ((select private.is_money_staff()));
revoke insert, update, delete on public.customs, public.custom_rates, public.custom_members, public.custom_watchers,
  public.custom_ledger, public.custom_batches, public.custom_member_confirmations from anon, authenticated;

-- ---------- helpers ----------
create or replace function private.assert_custom_staff()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active() or not private.is_money_staff() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
end $$;

create or replace function private.phone_key(_p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(_p, ''), '\D', '', 'g'), 10), '')
$$;

-- Members of a custom that are the current user: linked account, or same phone / email as the user's profile.
create or replace function private.my_custom_member_ids(_custom uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.custom_members m, public.profiles p
   where p.id = auth.uid() and m.custom_id = _custom and m.active
     and (m.user_id = p.id
          or (private.phone_key(m.phone) is not null and private.phone_key(m.phone) = private.phone_key(p.phone))
          or (m.email is not null and p.email is not null and lower(m.email) = lower(p.email)))
$$;

create or replace function private.custom_balance(_custom uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_kobo), 0)::bigint from public.custom_ledger where custom_id = _custom
$$;

create or replace function private.custom_admins()
returns table (user_id uuid, email text, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.full_name from public.profiles p
   where p.email is not null and p.status = 'active'
     and p.id in (
       select (jsonb_array_elements_text(coalesce((select value->'user_ids' from public.settings where key = 'customs_admin'), '[]'::jsonb)))::uuid
       union
       select (value->>'user_id')::uuid from public.settings where key = 'weekly_target_owner'
         and not exists (select 1 from public.settings where key = 'customs_admin'))
$$;

create or replace function private.custom_email(_to uuid, _email text, _heading text, _lines jsonb, _cta_url text, _cta_label text, _key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (_to, _email, 'custom_notice',
          jsonb_build_object('heading', _heading, 'lines', _lines, 'cta_url', _cta_url, 'cta_label', _cta_label), _key)
  on conflict (idempotency_key) do nothing
$$;

create or replace function private.naira(_k bigint)
returns text language sql immutable set search_path = '' as $$
  select '₦' || to_char(coalesce(_k, 0) / 100.0, 'FM999,999,999,990')
$$;

-- Charge for a batch from its lines. Plan: each category's allowance for the current period, less what earlier
-- charged batches in the same period used; pieces beyond it cost the rate. One-time: every piece costs the rate.
create or replace function private.custom_batch_charge(_order uuid)
returns table (charge_kobo bigint, breakdown jsonb) language plpgsql stable security definer set search_path = '' as $$
declare _b public.custom_batches; _c public.customs; _total bigint := 0; _rows jsonb := '[]'::jsonb; _r record; _used int; _free int; _over int; _cost bigint;
begin
  select * into _b from public.custom_batches where order_id = _order;
  select * into _c from public.customs where id = _b.custom_id;
  for _r in
    select i.custom_category_id cat, max(ic.name) cname, sum(i.qty)::int q, max(r.unit) unit, max(r.price_kobo) price, max(r.allowance) allowance
      from public.order_items i
      join public.item_categories ic on ic.id = i.custom_category_id
      left join public.custom_rates r on r.custom_id = _c.id and r.category_id = i.custom_category_id
     where i.order_id = _order and i.removed_at is null
     group by i.custom_category_id order by max(ic.name)
  loop
    if _r.price is null then raise exception 'rate_missing' using errcode = 'P0001'; end if;
    if _c.mode = 'plan' then
      select coalesce(sum(i.qty), 0)::int into _used
        from public.order_items i join public.custom_batches b on b.order_id = i.order_id
       where b.custom_id = _c.id and b.period_start is not distinct from _b.period_start and b.charged_at is not null
         and b.order_id <> _order and i.removed_at is null and i.custom_category_id = _r.cat;
      _free := greatest(0, coalesce(_r.allowance, 0) - _used);
      _over := greatest(0, _r.q - _free);
    else
      _used := 0; _free := 0; _over := _r.q;
    end if;
    _cost := _over::bigint * _r.price;
    _total := _total + _cost;
    _rows := _rows || jsonb_build_object('category_id', _r.cat, 'category', _r.cname, 'unit', _r.unit, 'qty', _r.q,
      'allowance', _r.allowance, 'used_before', _used, 'covered', _r.q - _over, 'charged', _over, 'price_kobo', _r.price, 'charge_kobo', _cost);
  end loop;
  charge_kobo := _total; breakdown := _rows;
  return next;
end $$;

-- Takes the charge from the balance and moves the batch into the wash queue. Raises balance_low if not covered.
create or replace function private.custom_finalize_batch(_order uuid, _via text)
returns void language plpgsql security definer set search_path = '' as $$
declare _b public.custom_batches; _o public.orders; _ch record; _bal bigint;
begin
  select * into _o from public.orders where id = _order for update;
  select * into _b from public.custom_batches where order_id = _order for update;
  if _o.status <> 'counted' or _b.charged_at is not null then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  perform 1 from public.customs where id = _b.custom_id for update;
  select * into _ch from private.custom_batch_charge(_order);
  _bal := private.custom_balance(_b.custom_id);
  if _bal < _ch.charge_kobo then raise exception 'balance_low' using errcode = 'P0001'; end if;
  if _ch.charge_kobo > 0 then
    insert into public.custom_ledger (custom_id, kind, amount_kobo, order_id, period_start, note, created_by)
    values (_b.custom_id, 'batch', -_ch.charge_kobo, _order, _b.period_start, 'Batch #' || _o.order_no, auth.uid());
  end if;
  update public.custom_batches set charge_kobo = _ch.charge_kobo, breakdown = _ch.breakdown, charged_at = now(),
    confirmed_via = _via, confirmed_by = auth.uid() where order_id = _order;
  update public.order_items set check_state = 'ok', check_note = coalesce(check_note, 'Counted at the desk, confirmed by the custom')
   where order_id = _order and removed_at is null and check_state <> 'ok';
  update public.orders set status = 'count_confirmed' where id = _order;
end $$;

-- A confirmed custom batch goes straight into the wash queue (it was counted at the desk).
create or replace function private.custom_order_auto_receive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = 'received' where id = new.id and status = 'count_confirmed';
  return null;
end $$;
create trigger zz_orders_custom_auto_receive after update of status on public.orders
  for each row when (new.status = 'count_confirmed' and old.status is distinct from new.status and new.source = 'custom')
  execute function private.custom_order_auto_receive();

-- Customs send their own notices: skip the generic customer WhatsApp and email triggers (pickup / pay-for-delivery wording).
drop trigger if exists orders_whatsapp_outbox on public.orders;
create trigger orders_whatsapp_outbox after update of status on public.orders
  for each row when (new.source is distinct from 'custom') execute function private.enqueue_order_status_whatsapp();
drop trigger if exists orders_customer_emails on public.orders;
create trigger orders_customer_emails after update of status, fulfillment_choice on public.orders
  for each row when (new.source is distinct from 'custom') execute function private.order_customer_emails();

-- Notices to the manager and every member who has items in the batch (in-app).
create or replace function private.custom_notify(_order uuid, _title text, _body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.user_notifications (user_id, title, body, kind, order_id)
  select distinct u, _title, _body, 'custom', _order from (
    select c.manager_id u from public.orders o join public.customs c on c.id = o.custom_id where o.id = _order
    union
    select p.id from public.order_items i join public.custom_members m on m.id = i.custom_member_id
      join public.profiles p on (p.id = m.user_id
        or (private.phone_key(m.phone) is not null and private.phone_key(m.phone) = private.phone_key(p.phone))
        or (m.email is not null and p.email is not null and lower(m.email) = lower(p.email)))
     where i.order_id = _order and i.removed_at is null and p.status = 'active') t
$$;

-- ---------- staff: set up ----------
create or replace function public.create_custom(_name text, _kind text, _mode text, _manager uuid, _delivery text,
  _address text, _lat double precision, _lng double precision, _period text, _period_fee_kobo bigint, _notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid; _base text; _code text; _n int := 0; _a record; _mgr public.profiles;
begin
  perform private.assert_custom_staff();
  if _kind not in ('business', 'lodge') or _mode not in ('plan', 'one_time') or coalesce(_delivery, 'collect') not in ('collect', 'deliver') then
    raise exception 'invalid_custom' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(_name, ''))) < 2 then raise exception 'name_required' using errcode = 'P0001'; end if;
  if _mode = 'plan' and coalesce(_period, '') not in ('weekly', 'monthly') then raise exception 'period_required' using errcode = 'P0001'; end if;
  if _mode = 'plan' and coalesce(_period_fee_kobo, 0) <= 0 then raise exception 'period_fee_required' using errcode = 'P0001'; end if;
  if coalesce(_delivery, 'collect') = 'deliver' and (length(trim(coalesce(_address, ''))) < 5 or _lat is null or _lng is null) then
    raise exception 'custom_needs_address' using errcode = 'P0001';
  end if;
  select * into _mgr from public.profiles where id = _manager and status = 'active';
  if not found then raise exception 'manager_not_found' using errcode = 'P0001'; end if;
  _base := rpad(left(regexp_replace(upper(_name), '[^A-Z]', '', 'g'), 3), 3, 'X');
  _code := _base;
  while exists (select 1 from public.customs where code = _code) loop
    _n := _n + 1;
    if _n > 99 then raise exception 'code_unavailable' using errcode = 'P0001'; end if;
    _code := _base || _n;
  end loop;
  insert into public.customs (name, code, kind, mode, manager_id, delivery, address, lat, lng, period, period_fee_kobo, notes, created_by)
  values (trim(_name), _code, _kind, _mode, _manager, coalesce(_delivery, 'collect'), nullif(trim(coalesce(_address, '')), ''), _lat, _lng,
          case when _mode = 'plan' then _period end, case when _mode = 'plan' then _period_fee_kobo else 0 end,
          nullif(trim(coalesce(_notes, '')), ''), auth.uid())
  returning id into _id;
  for _a in select * from private.custom_admins() loop
    perform private.custom_email(_a.user_id, _a.email, 'New custom: ' || trim(_name),
      jsonb_build_array(
        'A new custom was entered by ' || coalesce((select full_name from public.profiles where id = auth.uid()), 'staff') || '.',
        'Type: ' || case _kind when 'lodge' then 'Student lodge' else 'Business' end || ' · ' ||
          case when _mode = 'plan' then initcap(_period) || ' plan, ' || private.naira(_period_fee_kobo) || ' per ' || replace(_period, 'ly', '') else 'One-time' end,
        'Manager: ' || coalesce(_mgr.full_name, '') || coalesce(' (' || _mgr.phone || ')', ''),
        'Next: set the rate card, add members, and record the first deposit before any clothes are taken in.'),
      'https://laundrypoint.app/staff/customs/' || _id, 'Open the custom', 'custom-created-' || _id || '-' || _a.user_id);
    insert into public.user_notifications (user_id, title, body, kind) values (_a.user_id, 'New custom: ' || trim(_name), 'Set its rates, members and first deposit.', 'custom');
  end loop;
  insert into public.user_notifications (user_id, title, body, kind)
  values (_manager, 'You manage ' || trim(_name) || ' on LaundryPoint', 'Open My customs to see the balance, members and batches.', 'custom');
  return _id;
end $$;

create or replace function public.update_custom(_custom uuid, _patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare _c public.customs;
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom for update;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if _patch ? 'manager_id' and not exists (select 1 from public.profiles where id = (_patch->>'manager_id')::uuid and status = 'active') then
    raise exception 'manager_not_found' using errcode = 'P0001';
  end if;
  if _patch ? 'period_fee_kobo' and _c.mode = 'plan' and coalesce((_patch->>'period_fee_kobo')::bigint, 0) <= 0 then
    raise exception 'period_fee_required' using errcode = 'P0001';
  end if;
  update public.customs set
    name = case when _patch ? 'name' then trim(_patch->>'name') else name end,
    manager_id = case when _patch ? 'manager_id' then (_patch->>'manager_id')::uuid else manager_id end,
    status = case when _patch ? 'status' then _patch->>'status' else status end,
    delivery = case when _patch ? 'delivery' then _patch->>'delivery' else delivery end,
    address = case when _patch ? 'address' then nullif(trim(_patch->>'address'), '') else address end,
    lat = case when _patch ? 'lat' then (_patch->>'lat')::double precision else lat end,
    lng = case when _patch ? 'lng' then (_patch->>'lng')::double precision else lng end,
    period_fee_kobo = case when _patch ? 'period_fee_kobo' and mode = 'plan' then (_patch->>'period_fee_kobo')::bigint else period_fee_kobo end,
    notes = case when _patch ? 'notes' then nullif(trim(_patch->>'notes'), '') else notes end,
    updated_at = now()
  where id = _custom;
exception when check_violation then raise exception 'invalid_custom' using errcode = 'P0001';
end $$;

-- Replaces the whole rate card: [{category_id, unit, price_kobo, allowance}]. Allowance is required on plans.
create or replace function public.set_custom_rates(_custom uuid, _rates jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _r jsonb;
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom for update;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if jsonb_typeof(_rates) <> 'array' or jsonb_array_length(_rates) = 0 then raise exception 'rates_required' using errcode = 'P0001'; end if;
  delete from public.custom_rates where custom_id = _custom;
  for _r in select * from jsonb_array_elements(_rates) loop
    if not exists (select 1 from public.item_categories where id = (_r->>'category_id')::uuid) then raise exception 'invalid_rate' using errcode = 'P0001'; end if;
    if coalesce(_r->>'unit', '') not in ('piece', 'kg', 'bag', 'set') or coalesce((_r->>'price_kobo')::bigint, -1) < 0 then
      raise exception 'invalid_rate' using errcode = 'P0001';
    end if;
    if _c.mode = 'plan' and (_r->>'allowance' is null or (_r->>'allowance')::int < 0) then raise exception 'allowance_required' using errcode = 'P0001'; end if;
    insert into public.custom_rates (custom_id, category_id, unit, price_kobo, allowance)
    values (_custom, (_r->>'category_id')::uuid, _r->>'unit', (_r->>'price_kobo')::bigint,
            case when _c.mode = 'plan' then (_r->>'allowance')::int end);
  end loop;
exception when unique_violation then raise exception 'duplicate_rate' using errcode = 'P0001';
end $$;

create or replace function public.add_custom_member(_custom uuid, _name text, _phone text, _email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _seq int; _id uuid; _user uuid; _e text := nullif(lower(trim(coalesce(_email, ''))), ''); _p text := nullif(trim(coalesce(_phone, '')), '');
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom for update;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_name, ''))) < 2 then raise exception 'name_required' using errcode = 'P0001'; end if;
  if _e is not null and _e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  if _p is not null and private.phone_key(_p) is null then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  if exists (select 1 from public.custom_members m where m.custom_id = _custom and m.active
              and ((_p is not null and private.phone_key(m.phone) = private.phone_key(_p)) or (_e is not null and lower(m.email) = _e))) then
    raise exception 'member_exists' using errcode = 'P0001';
  end if;
  select p.id into _user from public.profiles p
   where p.status = 'active' and ((_p is not null and private.phone_key(p.phone) = private.phone_key(_p)) or (_e is not null and lower(p.email) = _e))
   order by p.created_at limit 1;
  select coalesce(max(seq), 0) + 1 into _seq from public.custom_members where custom_id = _custom;
  insert into public.custom_members (custom_id, seq, tag, full_name, phone, email, user_id, added_by)
  values (_custom, _seq, _c.code || '-' || lpad(_seq::text, 2, '0'), trim(_name), _p, _e, _user, auth.uid())
  returning id into _id;
  if _user is not null then
    insert into public.user_notifications (user_id, title, body, kind)
    values (_user, 'You were added to ' || _c.name, 'Your clothes tag is ' || _c.code || '-' || lpad(_seq::text, 2, '0') || '. See your items under My customs.', 'custom');
  end if;
  return _id;
end $$;

create or replace function public.remove_custom_member(_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_custom_staff();
  update public.custom_members set active = false where id = _member and active;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
end $$;

create or replace function public.add_custom_watcher(_custom uuid, _email text)
returns void language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _e text := lower(trim(coalesce(_email, '')));
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if _e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  insert into public.custom_watchers (custom_id, email, added_by) values (_custom, _e, auth.uid());
  perform private.custom_email(null, _e, 'Laundry updates for ' || _c.name,
    jsonb_build_array('You have been given a link to follow ' || _c.name || '''s laundry with LaundryPoint: the balance, '
      || case when _c.mode = 'plan' then 'plan usage ' else '' end || 'and every batch of clothes.',
      'Keep this link private. Anyone with it can view these details (but cannot change anything).'),
    'https://laundrypoint.app/customs/view/' || _c.share_token, 'View ' || _c.name, 'custom-watch-' || _custom || '-' || _e);
exception when unique_violation then raise exception 'watcher_exists' using errcode = 'P0001';
end $$;

create or replace function public.remove_custom_watcher(_watcher uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_custom_staff();
  delete from public.custom_watchers where id = _watcher;
  if not found then raise exception 'watcher_not_found' using errcode = 'P0001'; end if;
end $$;

-- ---------- money ----------
create or replace function public.record_custom_deposit(_custom uuid, _amount_kobo bigint, _mode text, _money_point uuid, _note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _pay uuid; _ref text; _b record;
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom for update;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if coalesce(_amount_kobo, 0) < 100 then raise exception 'custom_deposit_amount' using errcode = 'P0001'; end if;
  if _mode not in ('cash', 'transfer', 'pos') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.money_points where id = _money_point and active and kind <> 'online') then raise exception 'money_point_required' using errcode = 'P0001'; end if;
  if _mode <> 'cash' and length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  _ref := 'CU-' || _c.code || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  insert into public.payments (customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by)
  values (_c.manager_id, 'custom_deposit', 'payment', _mode, _amount_kobo, _ref, 'success', _money_point,
          coalesce(nullif(trim(coalesce(_note, '')), '') || ' · ', '') || 'Custom ' || _c.name, auth.uid())
  returning id into _pay;
  insert into public.custom_ledger (custom_id, kind, amount_kobo, payment_id, note, created_by)
  values (_custom, 'deposit', _amount_kobo, _pay, _ref, auth.uid());
  insert into public.user_notifications (user_id, title, body, kind)
  values (_c.manager_id, _c.name || ': ' || private.naira(_amount_kobo) || ' added', 'New balance: ' || private.naira(private.custom_balance(_custom)) || '.', 'custom');
  -- Batches already confirmed by all their members but waiting for money go through now, oldest first.
  for _b in
    select b.order_id from public.custom_batches b join public.orders o on o.id = b.order_id
     where b.custom_id = _custom and o.status = 'counted' and b.charged_at is null
       and not exists (select 1 from public.order_items i where i.order_id = b.order_id and i.removed_at is null
                        and not exists (select 1 from public.custom_member_confirmations mc where mc.order_id = b.order_id and mc.member_id = i.custom_member_id))
     order by b.submitted_at
  loop
    begin
      perform private.custom_finalize_batch(_b.order_id, 'members');
    exception when others then
      if sqlerrm <> 'balance_low' then raise; end if;
    end;
  end loop;
  return _pay;
end $$;

-- Starts the next plan period and takes the period fee from the balance.
create or replace function public.start_custom_period(_custom uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _today date := private.today_lagos(); _start date; _end date;
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom for update;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if _c.mode <> 'plan' then raise exception 'not_a_plan' using errcode = 'P0001'; end if;
  if _c.status <> 'active' then raise exception 'custom_not_active' using errcode = 'P0001'; end if;
  if _c.period_end is not null and _c.period_end >= _today then raise exception 'period_active' using errcode = 'P0001'; end if;
  if private.custom_balance(_custom) < _c.period_fee_kobo then raise exception 'balance_low' using errcode = 'P0001'; end if;
  _start := _today;
  _end := case when _c.period = 'weekly' then _start + 6 else (_start + interval '1 month')::date - 1 end;
  insert into public.custom_ledger (custom_id, kind, amount_kobo, period_start, note, created_by)
  values (_custom, 'plan_fee', -_c.period_fee_kobo, _start, initcap(_c.period) || ' plan ' || to_char(_start, 'DD Mon') || ' to ' || to_char(_end, 'DD Mon'), auth.uid());
  update public.customs set period_start = _start, period_end = _end, updated_at = now() where id = _custom;
  insert into public.user_notifications (user_id, title, body, kind)
  values (_c.manager_id, _c.name || ': plan period started', to_char(_start, 'DD Mon') || ' to ' || to_char(_end, 'DD Mon') || '. ' || private.naira(_c.period_fee_kobo) || ' taken from the balance.', 'custom');
  return jsonb_build_object('period_start', _start, 'period_end', _end, 'balance_kobo', private.custom_balance(_custom));
end $$;

-- Super admin only: correct the balance (for example money returned to the business). Positive adds, negative removes.
create or replace function public.custom_adjust(_custom uuid, _amount_kobo bigint, _note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_active() or not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.customs where id = _custom) then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if coalesce(_amount_kobo, 0) = 0 then raise exception 'custom_deposit_amount' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if _amount_kobo < 0 and private.custom_balance(_custom) + _amount_kobo < 0 then raise exception 'balance_low' using errcode = 'P0001'; end if;
  insert into public.custom_ledger (custom_id, kind, amount_kobo, note, created_by) values (_custom, 'adjust', _amount_kobo, trim(_note), auth.uid());
end $$;

-- ---------- staff: batches ----------
create or replace function public.create_custom_batch(_custom uuid, _notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _c public.customs; _station uuid; _id uuid; _today date := private.today_lagos();
begin
  perform private.assert_custom_staff();
  select * into _c from public.customs where id = _custom;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if _c.status <> 'active' then raise exception 'custom_not_active' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.custom_rates where custom_id = _custom) or not exists (select 1 from public.custom_members where custom_id = _custom and active) then
    raise exception 'custom_not_ready' using errcode = 'P0001';
  end if;
  if _c.mode = 'plan' and not coalesce(_c.period_start <= _today and _c.period_end >= _today, false) then raise exception 'period_not_active' using errcode = 'P0001'; end if;
  if length(coalesce(_notes, '')) > 500 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
  if _station is null then raise exception 'staff_station_required' using errcode = 'P0001'; end if;
  insert into public.orders (customer_id, source, status, pickup_fare_kobo, delivery_fare_kobo, notes, created_by, zone_id, custom_id)
  values (_c.manager_id, 'custom', 'agent_arrived', 0, 0, nullif(trim(coalesce(_notes, '')), ''), auth.uid(), _station, _custom)
  returning id into _id;
  insert into public.custom_batches (order_id, custom_id, period_start) values (_id, _custom, case when _c.mode = 'plan' then _c.period_start end);
  return _id;
end $$;

-- Sets one member's quantity for one category on an open batch. Quantity 0 removes the line.
create or replace function public.set_custom_line(_order uuid, _member uuid, _category uuid, _qty integer)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _cat text; _unit text; _line uuid;
begin
  perform private.assert_custom_staff();
  select * into _o from public.orders where id = _order for update;
  if not found or _o.source <> 'custom' then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status <> 'agent_arrived' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.custom_members where id = _member and custom_id = _o.custom_id and active) then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  select ic.name, r.unit into _cat, _unit from public.custom_rates r join public.item_categories ic on ic.id = r.category_id
   where r.custom_id = _o.custom_id and r.category_id = _category;
  if not found then raise exception 'rate_missing' using errcode = 'P0001'; end if;
  if _qty is null or _qty < 0 or _qty > 500 then raise exception 'custom_qty_invalid' using errcode = 'P0001'; end if;
  select id into _line from public.order_items where order_id = _order and custom_member_id = _member and custom_category_id = _category and removed_at is null;
  if _qty = 0 then
    if _line is not null then delete from public.order_items where id = _line; end if;
  elsif _line is not null then
    update public.order_items set qty = _qty where id = _line;
  else
    insert into public.order_items (order_id, name, category_name, qty, unit_price_kobo, created_by, custom_member_id, custom_category_id)
    values (_order, _cat || case when _unit <> 'piece' then ' (' || _unit || ')' else '' end, _cat, _qty, 0, auth.uid(), _member, _category);
  end if;
end $$;

create or replace function public.submit_custom_count(_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _c public.customs; _ch record; _pieces int; _members int; _a record; _bal bigint;
begin
  perform private.assert_custom_staff();
  select * into _o from public.orders where id = _order for update;
  if not found or _o.source <> 'custom' then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status <> 'agent_arrived' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.order_items where order_id = _order and removed_at is null) then raise exception 'no_items' using errcode = 'P0001'; end if;
  select * into _c from public.customs where id = _o.custom_id;
  select * into _ch from private.custom_batch_charge(_order);
  select coalesce(sum(qty), 0)::int, count(distinct custom_member_id)::int into _pieces, _members from public.order_items where order_id = _order and removed_at is null;
  delete from public.custom_member_confirmations where order_id = _order;
  update public.custom_batches set charge_kobo = _ch.charge_kobo, breakdown = _ch.breakdown, submitted_at = now() where order_id = _order;
  update public.orders set status = 'counted' where id = _order;
  _bal := private.custom_balance(_c.id);
  perform private.custom_notify(_order, _c.name || ': batch #' || _o.order_no || ' counted',
    _pieces || ' pieces for ' || _members || ' member' || case when _members = 1 then '' else 's' end || '. Please check and confirm your items under My customs.'
    || case when _ch.charge_kobo > _bal then ' The balance must be topped up before it can be washed.' else '' end);
  for _a in select * from private.custom_admins() loop
    perform private.custom_email(_a.user_id, _a.email, _c.name || ': batch #' || _o.order_no || ' entered',
      jsonb_build_array(
        _pieces || ' pieces for ' || _members || ' member' || case when _members = 1 then '' else 's' end || ', entered by '
          || coalesce((select full_name from public.profiles where id = auth.uid()), 'staff') || '.',
        'Charge: ' || private.naira(_ch.charge_kobo) || case when _c.mode = 'plan' then ' (pieces beyond the plan allowance)' else '' end
          || '. Balance: ' || private.naira(_bal) || '.',
        case when _ch.charge_kobo > _bal then 'The balance does not cover this batch. It waits until a deposit is recorded.' else 'It moves to washing once the manager or the members confirm.' end),
      'https://laundrypoint.app/staff/customs/batch/' || _order, 'Open the batch', 'custom-batch-' || _order || '-' || _a.user_id || '-' || gen_random_uuid());
  end loop;
  return jsonb_build_object('pieces', _pieces, 'charge_kobo', _ch.charge_kobo, 'balance_kobo', _bal);
end $$;

create or replace function public.reopen_custom_count(_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  perform private.assert_custom_staff();
  select * into _o from public.orders where id = _order for update;
  if not found or _o.source <> 'custom' then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status <> 'counted' or exists (select 1 from public.custom_batches where order_id = _order and charged_at is not null) then
    raise exception 'wrong_state' using errcode = 'P0001';
  end if;
  delete from public.custom_member_confirmations where order_id = _order;
  update public.custom_batches set submitted_at = null where order_id = _order;
  update public.orders set status = 'agent_arrived' where id = _order;
end $$;

-- Desk hands a ready batch to the custom (collection).
create or replace function public.custom_handover(_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_custom_staff();
  update public.orders set status = 'delivered', delivered_at = now() where id = _order and source = 'custom' and status = 'ready';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

-- ---------- manager and members ----------
create or replace function public.confirm_custom_batch(_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _c public.customs; _mine uuid[]; _left int;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.source <> 'custom' then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  select * into _c from public.customs where id = _o.custom_id;
  if _o.status <> 'counted' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _c.manager_id = auth.uid() then
    perform private.custom_finalize_batch(_order, 'manager');
    return jsonb_build_object('status', 'confirmed');
  end if;
  select array_agg(distinct i.custom_member_id) into _mine from public.order_items i
   where i.order_id = _order and i.removed_at is null and i.custom_member_id in (select private.my_custom_member_ids(_c.id));
  if _mine is null then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  insert into public.custom_member_confirmations (order_id, member_id, user_id)
  select _order, m, auth.uid() from unnest(_mine) m on conflict do nothing;
  select count(distinct i.custom_member_id)::int into _left from public.order_items i
   where i.order_id = _order and i.removed_at is null
     and not exists (select 1 from public.custom_member_confirmations mc where mc.order_id = _order and mc.member_id = i.custom_member_id);
  if _left > 0 then return jsonb_build_object('status', 'waiting_members', 'members_left', _left); end if;
  begin
    perform private.custom_finalize_batch(_order, 'members');
  exception when others then
    if sqlerrm = 'balance_low' then return jsonb_build_object('status', 'waiting_balance'); end if;
    raise;
  end;
  return jsonb_build_object('status', 'confirmed');
end $$;

-- ---------- reading ----------
create or replace function private.custom_usage(_c public.customs)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('category_id', r.category_id, 'category', ic.name, 'unit', r.unit, 'price_kobo', r.price_kobo,
    'allowance', r.allowance,
    'used', (select coalesce(sum(i.qty), 0) from public.order_items i join public.custom_batches b on b.order_id = i.order_id
              where b.custom_id = _c.id and b.charged_at is not null and i.removed_at is null and i.custom_category_id = r.category_id
                and (_c.mode = 'one_time' or b.period_start is not distinct from _c.period_start)))
    order by ic.sort_order, ic.name), '[]'::jsonb)
    from public.custom_rates r join public.item_categories ic on ic.id = r.category_id where r.custom_id = _c.id
$$;

-- Full view. Staff and the manager see everything; a member sees the custom, the rate card and only their own items.
create or replace function public.custom_view(_custom uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _c public.customs; _role text; _mine uuid[];
begin
  select * into _c from public.customs where id = _custom;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  if private.is_active() and private.is_money_staff() then _role := 'staff';
  elsif _c.manager_id = auth.uid() and private.is_active() then _role := 'manager';
  else
    select array_agg(x) into _mine from private.my_custom_member_ids(_custom) x;
    if _mine is null or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    _role := 'member';
  end if;
  return jsonb_build_object(
    'role', _role,
    'my_member_ids', coalesce(to_jsonb(_mine), '[]'::jsonb),
    'custom', jsonb_build_object('id', _c.id, 'name', _c.name, 'code', _c.code, 'kind', _c.kind, 'mode', _c.mode, 'status', _c.status,
      'delivery', _c.delivery, 'address', _c.address, 'lat', _c.lat, 'lng', _c.lng, 'period', _c.period, 'period_fee_kobo', _c.period_fee_kobo,
      'period_start', _c.period_start, 'period_end', _c.period_end, 'notes', case when _role = 'staff' then _c.notes end,
      'share_token', case when _role in ('staff', 'manager') then _c.share_token end, 'created_at', _c.created_at,
      'manager', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', case when _role <> 'member' then p.phone end, 'email', case when _role <> 'member' then p.email end) from public.profiles p where p.id = _c.manager_id)),
    'balance_kobo', case when _role <> 'member' then private.custom_balance(_custom) end,
    'usage', private.custom_usage(_c),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'tag', m.tag, 'name', m.full_name,
        'phone', case when _role <> 'member' then m.phone end, 'email', case when _role <> 'member' then m.email end,
        'linked', m.user_id is not null) order by m.seq)
      from public.custom_members m where m.custom_id = _custom and m.active and (_role <> 'member' or m.id = any(_mine))), '[]'::jsonb),
    'watchers', case when _role <> 'member' then coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'email', w.email) order by w.created_at) from public.custom_watchers w where w.custom_id = _custom), '[]'::jsonb) end,
    'batches', coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
      select jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'status', o.status, 'created_at', o.created_at,
        'charge_kobo', case when _role <> 'member' then b.charge_kobo end, 'charged', b.charged_at is not null,
        'confirmed_via', b.confirmed_via,
        'shelves', (select coalesce(jsonb_agg(s.shelf order by s.shelf), '[]'::jsonb) from public.order_shelves s where s.order_id = o.id and s.released_at is null),
        'pieces', (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o.id and i.removed_at is null and (_role <> 'member' or i.custom_member_id = any(_mine))),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('member_id', i.custom_member_id, 'member', m.full_name, 'tag', m.tag,
              'category_id', i.custom_category_id, 'category', i.category_name, 'qty', i.qty,
              'confirmed', exists (select 1 from public.custom_member_confirmations mc where mc.order_id = o.id and mc.member_id = i.custom_member_id))
              order by m.seq, i.category_name), '[]'::jsonb)
            from public.order_items i join public.custom_members m on m.id = i.custom_member_id
           where i.order_id = o.id and i.removed_at is null and (_role <> 'member' or i.custom_member_id = any(_mine))),
        'breakdown', case when _role <> 'member' then b.breakdown end) x
        from public.orders o join public.custom_batches b on b.order_id = o.id
       where o.custom_id = _custom and (_role <> 'member' or exists (select 1 from public.order_items i where i.order_id = o.id and i.removed_at is null and i.custom_member_id = any(_mine)))
       order by o.created_at desc limit 60) t), '[]'::jsonb),
    'ledger', case when _role <> 'member' then coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'amount_kobo', l.amount_kobo, 'note', l.note, 'at', l.created_at) order by l.created_at desc)
      from (select * from public.custom_ledger where custom_id = _custom order by created_at desc limit 50) l), '[]'::jsonb) end);
end $$;

create or replace function public.customs_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_custom_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'kind', c.kind, 'mode', c.mode, 'status', c.status,
    'period', c.period, 'period_end', c.period_end, 'manager', p.full_name, 'balance_kobo', private.custom_balance(c.id),
    'members', (select count(*) from public.custom_members m where m.custom_id = c.id and m.active),
    'open_batches', (select count(*) from public.orders o where o.custom_id = c.id and o.status not in ('delivered', 'closed', 'cancelled')))
    order by c.status, c.name)
    from public.customs c join public.profiles p on p.id = c.manager_id), '[]'::jsonb);
end $$;

-- Customs the signed-in person manages or belongs to.
create or replace function public.my_customs()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'mode', c.mode, 'period', c.period, 'status', c.status,
    'role', case when c.manager_id = auth.uid() then 'manager' else 'member' end,
    'tag', (select string_agg(m.tag, ', ') from public.custom_members m where m.id in (select private.my_custom_member_ids(c.id))),
    'to_confirm', (select count(distinct o.id) from public.orders o join public.order_items i on i.order_id = o.id and i.removed_at is null
       where o.custom_id = c.id and o.status = 'counted'
         and (c.manager_id = auth.uid() or (i.custom_member_id in (select private.my_custom_member_ids(c.id))
              and not exists (select 1 from public.custom_member_confirmations mc where mc.order_id = o.id and mc.member_id = i.custom_member_id)))))
    order by c.name), '[]'::jsonb)
    from public.customs c
   where auth.uid() is not null and (c.manager_id = auth.uid() or exists (select 1 from private.my_custom_member_ids(c.id)))
$$;

-- Read-only page for third parties with the link. No member names or phone numbers.
create or replace function public.custom_public(_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _c public.customs;
begin
  if _token !~ '^[0-9a-f]{32}$' then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  select * into _c from public.customs where share_token = _token;
  if not found then raise exception 'custom_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('name', _c.name, 'kind', _c.kind, 'mode', _c.mode, 'status', _c.status, 'period', _c.period,
    'period_start', _c.period_start, 'period_end', _c.period_end, 'period_fee_kobo', _c.period_fee_kobo,
    'balance_kobo', private.custom_balance(_c.id), 'usage', private.custom_usage(_c),
    'members', (select count(*) from public.custom_members m where m.custom_id = _c.id and m.active),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('order_no', o.order_no, 'status', o.status, 'created_at', o.created_at,
        'pieces', (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o.id and i.removed_at is null),
        'charge_kobo', b.charge_kobo, 'charged', b.charged_at is not null) order by o.created_at desc)
      from (select * from public.orders where custom_id = _c.id order by created_at desc limit 30) o join public.custom_batches b on b.order_id = o.id), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'amount_kobo', l.amount_kobo, 'at', l.created_at) order by l.created_at desc)
      from (select * from public.custom_ledger where custom_id = _c.id order by created_at desc limit 30) l), '[]'::jsonb));
end $$;

-- ---------- Mark ready: customs are collected at the desk or delivered at no extra fare ----------
create or replace function public.mark_ready(_order uuid, _shelves text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare _o public.orders; _f jsonb; _round bigint; _min bigint; _fare bigint; _station uuid; _transport_paid boolean; _c public.customs;
begin
  if not private.is_active()
     or not (private.is_shift_manager() or private.has_role('washer'::public.staff_role)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.status <> 'in_house' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if private.has_role('washer'::public.staff_role) and not private.is_shift_manager() then
    select station_zone_id into _station from public.staff_profiles where user_id = auth.uid();
    if _station is null or _o.zone_id is distinct from _station then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  end if;
  if _o.source <> 'subscription' and private.items_due(_order) > 0 then raise exception 'balance_due' using errcode = 'P0001'; end if;
  perform private.put_on_shelves(_order, _shelves);
  if _o.source = 'custom' then
    select * into _c from public.customs where id = _o.custom_id;
    if _c.delivery = 'deliver' then
      update public.orders set status = 'out_for_delivery', ready_at = now(), delivery_fare_kobo = 0, fulfillment_choice = 'deliver',
        return_delivery_address = _c.address, return_delivery_lat = _c.lat, return_delivery_lng = _c.lng where id = _order;
      perform private.custom_notify(_order, _c.name || ': batch #' || _o.order_no || ' is ready', 'It will be delivered to ' || coalesce(_c.address, 'your address') || '.');
    else
      update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0, fulfillment_choice = 'collect' where id = _order;
      perform private.custom_notify(_order, _c.name || ': batch #' || _o.order_no || ' is ready', 'Please collect it from the LaundryPoint hub.');
    end if;
    return;
  end if;
  if _o.source = 'walk_in' then
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    return;
  end if;
  if _o.source = 'subscription' then
    select coalesce(sp.transport_paid, false) into _transport_paid from public.subscription_pickups sp where sp.id = _o.subscription_pickup_id;
    -- Hub drop-offs (no pickup address) are collected from the hub.
    if _o.pickup_lat is null then
      update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = 0 where id = _order;
    else
      update public.orders set status = 'out_for_delivery', ready_at = now(),
        delivery_fare_kobo = case when coalesce(_transport_paid, false) then _o.delivery_fare_kobo else 0 end
      where id = _order;
    end if;
    return;
  end if;
  if _o.source = 'online' and coalesce(_o.delivery_fare_kobo, 0) > 0 then
    update public.orders set status = 'out_for_delivery', ready_at = now() where id = _order;
    return;
  end if;
  if _o.source = 'one_time' then
    if coalesce(_o.return_prepaid_kobo, 0) > 0 then
      -- Return was paid at booking: deliver to the booked address unless the customer changes it.
      update public.orders
         set status = 'ready', ready_at = now(), delivery_fare_kobo = 0,
             fulfillment_choice = coalesce(fulfillment_choice, 'deliver'),
             return_delivery_address = coalesce(return_delivery_address, pickup_address),
             return_delivery_lat = coalesce(return_delivery_lat, pickup_lat),
             return_delivery_lng = coalesce(return_delivery_lng, pickup_lng),
             return_delivery_distance_km = coalesce(return_delivery_distance_km, pickup_distance_km)
       where id = _order;
      insert into public.order_events (order_id, actor_id, event, detail)
      values (_order, auth.uid(), 'return_prepaid', jsonb_build_object('prepaid_kobo', _o.return_prepaid_kobo));
      return;
    end if;
    _fare := greatest(0, coalesce(_o.pickup_fare_kobo, 0));
    update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
    return;
  end if;
  select value into _f from public.settings where key = 'fare_delivery';
  _round := greatest(1, coalesce((_f->>'round_to_kobo')::bigint, 5000));
  _min := coalesce((_f->>'min_fare_kobo')::bigint, 0);
  _fare := greatest(_min, (round(coalesce(_o.pickup_distance_km, 0) * 2 * coalesce((_f->>'rate_per_km_kobo')::numeric, 0) / _round) * _round)::bigint);
  update public.orders set status = 'ready', ready_at = now(), delivery_fare_kobo = _fare where id = _order;
end
$function$;

-- ---------- grants ----------
revoke all on function private.assert_custom_staff(), private.phone_key(text), private.my_custom_member_ids(uuid), private.custom_balance(uuid),
  private.custom_admins(), private.custom_email(uuid, text, text, jsonb, text, text, text), private.naira(bigint),
  private.custom_batch_charge(uuid), private.custom_finalize_batch(uuid, text), private.custom_order_auto_receive(),
  private.custom_notify(uuid, text, text), private.custom_usage(public.customs) from public, anon, authenticated;

revoke all on function public.create_custom(text, text, text, uuid, text, text, double precision, double precision, text, bigint, text),
  public.update_custom(uuid, jsonb), public.set_custom_rates(uuid, jsonb), public.add_custom_member(uuid, text, text, text),
  public.remove_custom_member(uuid), public.add_custom_watcher(uuid, text), public.remove_custom_watcher(uuid),
  public.record_custom_deposit(uuid, bigint, text, uuid, text), public.start_custom_period(uuid), public.custom_adjust(uuid, bigint, text),
  public.create_custom_batch(uuid, text), public.set_custom_line(uuid, uuid, uuid, integer), public.submit_custom_count(uuid),
  public.reopen_custom_count(uuid), public.custom_handover(uuid), public.confirm_custom_batch(uuid), public.custom_view(uuid),
  public.customs_list(), public.my_customs(), public.custom_public(text) from public, anon;
grant execute on function public.create_custom(text, text, text, uuid, text, text, double precision, double precision, text, bigint, text),
  public.update_custom(uuid, jsonb), public.set_custom_rates(uuid, jsonb), public.add_custom_member(uuid, text, text, text),
  public.remove_custom_member(uuid), public.add_custom_watcher(uuid, text), public.remove_custom_watcher(uuid),
  public.record_custom_deposit(uuid, bigint, text, uuid, text), public.start_custom_period(uuid), public.custom_adjust(uuid, bigint, text),
  public.create_custom_batch(uuid, text), public.set_custom_line(uuid, uuid, uuid, integer), public.submit_custom_count(uuid),
  public.reopen_custom_count(uuid), public.custom_handover(uuid), public.confirm_custom_batch(uuid), public.custom_view(uuid),
  public.customs_list(), public.my_customs() to authenticated;
grant execute on function public.custom_public(text) to anon, authenticated;
