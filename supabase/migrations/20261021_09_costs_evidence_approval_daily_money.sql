-- 09: costs ledger with proof, approval, void-only corrections, blind cash counts, daily money view.
-- NOT YET APPLIED to the laundrypoint project. Review, then apply.

-- ===== Settings =====
insert into public.settings (key, value, description, is_public) values
  ('contact', '{"phone": null}'::jsonb, 'Phone number customers can call. Shown on the website and in emails', true),
  ('recovery', '{"basis": "profit"}'::jsonb, 'How cost recovery is measured: profit (sales minus approved expenses) or revenue (sales only)', false)
on conflict (key) do nothing;

-- Demurrage is charged per day after the grace period (fee per day stays admin-editable in settings).
update public.settings set value = value || '{"basis": "per_day"}'::jsonb where key = 'demurrage';

-- ===== Expenses: status, decision and void trail =====
alter table public.expenses
  add column if not exists status text not null default 'pending',
  add column if not exists vendor text,
  add column if not exists decided_by uuid,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists voided_by uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;
alter table public.expenses add constraint expenses_status_valid check (status in ('pending','approved','rejected','voided'));
alter table public.expenses add constraint expenses_amount_positive check (amount_kobo > 0);

alter table public.capital_entries
  add column if not exists status text not null default 'approved',
  add column if not exists voided_by uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;
alter table public.capital_entries add constraint capital_status_valid check (status in ('approved','voided'));

-- ===== Evidence (receipts, bank debits). One file can back only one record =====
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses(id),
  capital_id uuid references public.capital_entries(id),
  storage_path text not null unique,
  kind text not null check (kind in ('receipt','bank_debit','transfer_alert','invoice','other')),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  constraint evidence_one_parent check (num_nonnulls(expense_id, capital_id) = 1)
);
create index evidence_expense_idx on public.evidence (expense_id);
create index evidence_capital_idx on public.evidence (capital_id);
alter table public.evidence enable row level security;
create policy evidence_read on public.evidence for select to authenticated
  using ((select private.is_super_admin()) or uploaded_by = (select auth.uid()));

-- ===== Cash counts (blind counts, append-only) =====
create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  money_point_id uuid not null references public.money_points(id),
  counted_kobo bigint not null check (counted_kobo >= 0),
  basis text not null check (basis in ('day','balance')),
  expected_day_kobo bigint not null,
  expected_balance_kobo bigint not null,
  difference_kobo bigint generated always as (counted_kobo - case when basis = 'day' then expected_day_kobo else expected_balance_kobo end) stored,
  note text,
  counted_by uuid not null,
  created_at timestamptz not null default now()
);
create index cash_counts_point_day_idx on public.cash_counts (money_point_id, day);
alter table public.cash_counts enable row level security;
create policy cash_counts_read on public.cash_counts for select to authenticated using ((select private.is_super_admin()));

-- ===== No direct writes: everything goes through the functions below =====
-- (policies are switched to "never" rather than removed, so nothing is dropped)
alter policy expenses_insert on public.expenses with check (false);
alter policy expenses_update on public.expenses using (false) with check (false);
alter policy expenses_delete on public.expenses using (false);
alter policy expenses_read on public.expenses
  using ((select private.is_super_admin()) or entered_by = (select auth.uid()));
alter policy capital_insert on public.capital_entries with check (false);
alter policy capital_update on public.capital_entries using (false) with check (false);
alter policy capital_delete on public.capital_entries using (false);

-- ===== Guards: records can never be removed, and key fields can never change =====
create or replace function private.no_delete() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'records_cannot_be_removed' using errcode = 'P0001'; end $$;
create or replace function private.no_change() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'records_cannot_be_changed' using errcode = 'P0001'; end $$;

create trigger expenses_no_remove before delete on public.expenses for each row execute function private.no_delete();
create trigger capital_no_remove before delete on public.capital_entries for each row execute function private.no_delete();
create trigger evidence_no_remove before delete on public.evidence for each row execute function private.no_delete();
create trigger evidence_no_update before update on public.evidence for each row execute function private.no_change();
create trigger cash_counts_no_remove before delete on public.cash_counts for each row execute function private.no_delete();
create trigger cash_counts_no_update before update on public.cash_counts for each row execute function private.no_change();
create trigger evidence_audit after insert on public.evidence for each row execute function private.audit_row();
create trigger cash_counts_audit after insert on public.cash_counts for each row execute function private.audit_row();

create or replace function private.expense_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.amount_kobo <> old.amount_kobo or new.spent_on <> old.spent_on or new.label <> old.label
     or new.category_id is distinct from old.category_id or new.money_point_id is distinct from old.money_point_id
     or new.entered_by is distinct from old.entered_by or new.vendor is distinct from old.vendor
     or new.order_id is distinct from old.order_id or new.created_at <> old.created_at then
    raise exception 'expense_fields_cannot_be_changed' using errcode = 'P0001';
  end if;
  if old.status in ('rejected','voided') and new is distinct from old then
    raise exception 'expense_is_closed' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'pending' and new.status in ('approved','rejected','voided'))
    or (old.status = 'approved' and new.status = 'voided')) then
    raise exception 'invalid_status_change' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger expenses_guard before update on public.expenses for each row execute function private.expense_guard();

create or replace function private.capital_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind <> old.kind or new.label <> old.label or new.amount_kobo <> old.amount_kobo
     or new.entered_on <> old.entered_on or new.entered_by is distinct from old.entered_by or new.created_at <> old.created_at then
    raise exception 'capital_fields_cannot_be_changed' using errcode = 'P0001';
  end if;
  if old.status = 'voided' and new is distinct from old then raise exception 'entry_is_closed' using errcode = 'P0001'; end if;
  if new.status <> old.status and not (old.status = 'approved' and new.status = 'voided') then
    raise exception 'invalid_status_change' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger capital_guard before update on public.capital_entries for each row execute function private.capital_guard();

-- Payments: every payment must name its money point, and nothing about it moves after success
alter table public.payments add constraint payments_money_point_required check (money_point_id is not null);
create or replace function private.payments_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'success' and (new.status <> 'success' or new.amount_kobo <> old.amount_kobo or new.kind <> old.kind
      or new.mode <> old.mode or new.order_id is distinct from old.order_id
      or new.money_point_id is distinct from old.money_point_id or new.purpose <> old.purpose
      or new.recorded_by is distinct from old.recorded_by or new.paid_at is distinct from old.paid_at) then
    raise exception 'successful payments cannot be changed' using errcode = 'P0001';
  end if;
  if new.status = 'success' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end $$;

-- ===== Storage for receipts: private, images and PDF only, 10 MB, write-once =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-evidence', 'expense-evidence', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select private.has_role('accountant')) or (select private.is_super_admin())));
create policy evidence_view on storage.objects for select to authenticated
  using (bucket_id = 'expense-evidence'
    and ((select private.is_super_admin()) or (storage.foldername(name))[1] = (select auth.uid())::text));

-- ===== Helpers =====
create or replace function private.today_lagos() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Lagos')::date $$;

create or replace function private.attach_evidence(_expense uuid, _capital uuid, _evidence jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e jsonb; _path text; _kind text;
begin
  if _evidence is null or jsonb_typeof(_evidence) <> 'array' or jsonb_array_length(_evidence) < 1 then
    raise exception 'evidence_required' using errcode = 'P0001';
  end if;
  if jsonb_array_length(_evidence) > 8 then raise exception 'too_many_evidence_files' using errcode = 'P0001'; end if;
  for e in select * from jsonb_array_elements(_evidence) loop
    _path := e->>'path'; _kind := coalesce(e->>'kind', 'receipt');
    if _path is null or split_part(_path, '/', 1) <> auth.uid()::text then
      raise exception 'evidence_path_invalid' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'expense-evidence' and o.name = _path) then
      raise exception 'evidence_file_not_uploaded' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.evidence where storage_path = _path) then
      raise exception 'evidence_file_already_used' using errcode = 'P0001';
    end if;
    insert into public.evidence (expense_id, capital_id, storage_path, kind, uploaded_by)
    values (_expense, _capital, _path, _kind, auth.uid());
  end loop;
end $$;

create or replace function private.mp_figures(_mp uuid, _day date)
returns table (day_in bigint, day_refunds bigint, day_out bigint, day_net bigint, balance bigint)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(sum(gross_kobo) filter (where day = _day), 0) gi,
           coalesce(sum(refunded_kobo) filter (where day = _day), 0) gr,
           coalesce(sum(gross_kobo - refunded_kobo), 0) bal_in
      from public.daily_sales_summary where money_point_id = _mp and day <= _day),
  e as (
    select coalesce(sum(amount_kobo) filter (where spent_on = _day), 0) eo,
           coalesce(sum(amount_kobo), 0) eb
      from public.expenses where money_point_id = _mp and status = 'approved' and spent_on <= _day)
  select s.gi, s.gr, e.eo, s.gi - s.gr - e.eo,
         coalesce((select opening_balance_kobo from public.money_points where id = _mp), 0) + s.bal_in - e.eb
    from s, e $$;

-- ===== Expense and capital functions =====
create or replace function public.submit_expense(_label text, _amount_kobo bigint, _category_id uuid, _spent_on date,
  _money_point_id uuid, _vendor text, _evidence jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _id uuid; _super boolean := private.is_super_admin();
begin
  if not private.is_active() or not (_super or private.has_role('accountant')) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(_label, ''))) < 3 then raise exception 'label_required' using errcode = 'P0001'; end if;
  if _amount_kobo is null or _amount_kobo <= 0 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  if _spent_on is null or _spent_on > private.today_lagos() then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  if _category_id is null or not exists (select 1 from public.expense_categories where id = _category_id) then
    raise exception 'category_required' using errcode = 'P0001'; end if;
  if _money_point_id is null or not exists (select 1 from public.money_points where id = _money_point_id and active) then
    raise exception 'money_point_required' using errcode = 'P0001'; end if;

  insert into public.expenses (category_id, label, amount_kobo, spent_on, money_point_id, vendor, entered_by, status, decided_by, decided_at)
  values (_category_id, trim(_label), _amount_kobo, _spent_on, _money_point_id, nullif(trim(coalesce(_vendor, '')), ''), auth.uid(),
          case when _super then 'approved' else 'pending' end,
          case when _super then auth.uid() end, case when _super then now() end)
  returning id into _id;
  perform private.attach_evidence(_id, null, _evidence);
  return _id;
end $$;

create or replace function public.decide_expense(_id uuid, _approve boolean, _note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.expenses;
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select * into r from public.expenses where id = _id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'not_pending' using errcode = 'P0001'; end if;
  if r.entered_by = auth.uid() then raise exception 'cannot_decide_own_expense' using errcode = 'P0001'; end if;
  if not _approve and length(trim(coalesce(_note, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.expenses set status = case when _approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(_note, '')), '')
   where id = _id;
end $$;

create or replace function public.void_expense(_id uuid, _reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.expenses set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = trim(_reason)
   where id = _id and status in ('pending','approved');
  if not found then raise exception 'cannot_void' using errcode = 'P0001'; end if;
end $$;

create or replace function public.add_capital_entry(_kind text, _label text, _amount_kobo bigint, _entered_on date, _evidence jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _id uuid;
begin
  if not private.is_super_admin() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _kind not in ('capital','rent') then raise exception 'kind_invalid' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_label, ''))) < 3 then raise exception 'label_required' using errcode = 'P0001'; end if;
  if _amount_kobo is null or _amount_kobo <= 0 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  if _entered_on is null or _entered_on > private.today_lagos() then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  insert into public.capital_entries (kind, label, amount_kobo, entered_on, entered_by)
  values (_kind, trim(_label), _amount_kobo, _entered_on, auth.uid()) returning id into _id;
  perform private.attach_evidence(null, _id, _evidence);
  return _id;
end $$;

create or replace function public.void_capital_entry(_id uuid, _reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.capital_entries set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = trim(_reason)
   where id = _id and status = 'approved';
  if not found then raise exception 'cannot_void' using errcode = 'P0001'; end if;
end $$;

-- Blind count: the counter never sees the expected figure
create or replace function public.record_cash_count(_day date, _money_point_id uuid, _counted_kobo bigint, _basis text, _note text) returns void
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  if not private.is_active() or not private.is_money_staff() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _day is null or _day > private.today_lagos() then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  if _counted_kobo is null or _counted_kobo < 0 then raise exception 'amount_invalid' using errcode = 'P0001'; end if;
  if _basis not in ('day','balance') then raise exception 'basis_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.money_points where id = _money_point_id and active) then
    raise exception 'money_point_required' using errcode = 'P0001'; end if;
  select * into f from private.mp_figures(_money_point_id, _day);
  insert into public.cash_counts (day, money_point_id, counted_kobo, basis, expected_day_kobo, expected_balance_kobo, note, counted_by)
  values (_day, _money_point_id, _counted_kobo, _basis, f.day_net, f.balance, nullif(trim(coalesce(_note, '')), ''), auth.uid());
end $$;

-- ===== Reports =====
create or replace function private.recovery_core() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _basis text; _cap bigint; _rent bigint; _rev bigint; _tx bigint; _first date; _exp bigint; _m bigint;
        _today date := private.today_lagos(); _days int; _wrev bigint; _wexp bigint; _avg bigint; _cp numeric; _rp numeric;
begin
  _basis := coalesce((select value->>'basis' from public.settings where key = 'recovery'), 'profit');
  select coalesce(sum(amount_kobo) filter (where kind = 'capital'), 0), coalesce(sum(amount_kobo) filter (where kind = 'rent'), 0)
    into _cap, _rent from public.capital_entries where status = 'approved';
  select coalesce(sum(gross_kobo - refunded_kobo), 0), coalesce(sum(txn_count), 0), min(day) into _rev, _tx, _first from public.daily_sales_summary;
  select coalesce(sum(amount_kobo), 0) into _exp from public.expenses where status = 'approved';
  _m := case when _basis = 'revenue' then _rev else _rev - _exp end;
  _days := case when _first is null then 1 else greatest(1, least(30, _today - _first + 1)) end;
  select coalesce(sum(gross_kobo - refunded_kobo), 0) into _wrev from public.daily_sales_summary where day > _today - _days;
  select coalesce(sum(amount_kobo), 0) into _wexp from public.expenses where status = 'approved' and spent_on > _today - _days;
  _avg := (case when _basis = 'revenue' then _wrev else _wrev - _wexp end) / _days;
  _cp := case when _cap = 0 then 0 else least(100, greatest(0, _m)::numeric * 100 / _cap) end;
  _rp := case when _rent = 0 then 0 else least(100, greatest(0, _m - _cap)::numeric * 100 / _rent) end;
  return jsonb_build_object('basis', _basis, 'capital_kobo', _cap, 'rent_kobo', _rent, 'revenue_kobo', _rev, 'expenses_kobo', _exp,
    'measured_kobo', _m, 'avg_daily_kobo', _avg, 'days_used', _days, 'txn_count', _tx,
    'capital_pct', round(_cp, 1), 'rent_pct', round(_rp, 1),
    'capital_recovered', (_cap > 0 and _m >= _cap),
    'rent_recovered', (_rent > 0 and _cap > 0 and _m >= _cap + _rent),
    'both_recovered', (_cap > 0 and _rent > 0 and _m >= _cap + _rent));
end $$;

create or replace function public.recovery_progress() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb;
begin
  if not private.is_staff() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  c := private.recovery_core();
  return jsonb_build_object('capital_pct', c->'capital_pct', 'rent_pct', c->'rent_pct', 'capital_recovered', c->'capital_recovered',
    'rent_recovered', c->'rent_recovered', 'both_recovered', c->'both_recovered');
end $$;

create or replace function public.recovery_detail() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb; _today date := private.today_lagos(); _avg bigint; _rc bigint; _ra bigint; _m bigint; _tx bigint; _rev bigint;
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  c := private.recovery_core();
  _avg := (c->>'avg_daily_kobo')::bigint; _m := (c->>'measured_kobo')::bigint;
  _rc := greatest(0, (c->>'capital_kobo')::bigint - _m);
  _ra := greatest(0, (c->>'capital_kobo')::bigint + (c->>'rent_kobo')::bigint - _m);
  _tx := (c->>'txn_count')::bigint; _rev := (c->>'revenue_kobo')::bigint;
  return c || jsonb_build_object(
    'remaining_capital_kobo', _rc, 'remaining_total_kobo', _ra,
    'avg_monthly_kobo', _avg * 30,
    'avg_per_payment_kobo', case when _tx = 0 then 0 else _rev / _tx end,
    'projected_capital_date', case when (c->>'capital_kobo')::bigint = 0 then null when _rc = 0 then _today
        when _avg > 0 then _today + ceil(_rc::numeric / _avg)::int else null end,
    'projected_total_date', case when (c->>'capital_kobo')::bigint = 0 then null when _ra = 0 then _today
        when _avg > 0 then _today + ceil(_ra::numeric / _avg)::int else null end);
end $$;

create or replace function public.finance_overview(_from date, _to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _rev bigint; _exp bigint; _r jsonb;
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select coalesce(sum(gross_kobo - refunded_kobo), 0) into _rev from public.daily_sales_summary where day between _from and _to;
  select coalesce(sum(amount_kobo), 0) into _exp from public.expenses where status = 'approved' and spent_on between _from and _to;
  _r := jsonb_build_object(
    'revenue_kobo', _rev, 'expenses_kobo', _exp, 'profit_kobo', _rev - _exp,
    'by_mode', coalesce((select jsonb_object_agg(mode, v) from (
        select mode, sum(gross_kobo - refunded_kobo) as v from public.daily_sales_summary where day between _from and _to group by mode) m), '{}'::jsonb),
    'by_money_point', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(mp.name, 'Unassigned'), 'total_kobo', t.v)) from (
        select money_point_id, sum(gross_kobo - refunded_kobo) as v from public.daily_sales_summary where day between _from and _to group by money_point_id) t
        left join public.money_points mp on mp.id = t.money_point_id), '[]'::jsonb),
    'by_cashier', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Online'), 'total_kobo', t.v)) from (
        select cashier_id, sum(gross_kobo - refunded_kobo) as v from public.daily_sales_summary where day between _from and _to group by cashier_id) t
        left join public.profiles p on p.id = t.cashier_id), '[]'::jsonb));
  return _r;
end $$;

create or replace function public.daily_money_view(_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _r jsonb;
begin
  if not private.is_super_admin() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'day', _day,
    'points', coalesce((select jsonb_agg(q.pt order by q.pt->>'name') from (
        select jsonb_build_object(
          'id', m.id, 'name', m.name, 'kind', m.kind,
          'takings_in_kobo', f.day_in, 'refunds_kobo', f.day_refunds, 'expenses_out_kobo', f.day_out,
          'day_net_kobo', f.day_net, 'balance_kobo', f.balance,
          'by_mode', coalesce((select jsonb_object_agg(x.mode, x.v) from (
              select mode, sum(gross_kobo - refunded_kobo) v from public.daily_sales_summary
               where day = _day and money_point_id = m.id group by mode) x), '{}'::jsonb),
          'latest_count', (select jsonb_build_object('counted_kobo', c.counted_kobo, 'basis', c.basis, 'difference_kobo', c.difference_kobo,
                     'counted_by', coalesce(p.full_name, 'Unknown'), 'at', c.created_at, 'note', c.note)
                 from public.cash_counts c left join public.profiles p on p.id = c.counted_by
                where c.money_point_id = m.id and c.day = _day order by c.created_at desc limit 1)
        ) pt
        from public.money_points m cross join lateral private.mp_figures(m.id, _day) f where m.active) q), '[]'::jsonb),
    'online_kobo', coalesce((select sum(gross_kobo - refunded_kobo) from public.daily_sales_summary where day = _day and mode = 'paystack'), 0),
    'manual_kobo', coalesce((select sum(gross_kobo - refunded_kobo) from public.daily_sales_summary where day = _day and mode <> 'paystack'), 0),
    'online_by_purpose', coalesce((select jsonb_object_agg(purpose, v) from (
        select purpose, sum(case when kind = 'refund' then -amount_kobo else amount_kobo end) v from public.payments
         where status = 'success' and mode = 'paystack' and (paid_at at time zone 'Africa/Lagos')::date = _day group by purpose) y), '{}'::jsonb),
    'manual_by_purpose', coalesce((select jsonb_object_agg(purpose, v) from (
        select purpose, sum(case when kind = 'refund' then -amount_kobo else amount_kobo end) v from public.payments
         where status = 'success' and mode <> 'paystack' and (paid_at at time zone 'Africa/Lagos')::date = _day group by purpose) z), '{}'::jsonb),
    'pending_expenses', (select count(*) from public.expenses where status = 'pending')
  ) into _r;
  return _r;
end $$;

-- ===== Who may call what =====
revoke all on function public.submit_expense(text, bigint, uuid, date, uuid, text, jsonb) from public, anon;
revoke all on function public.decide_expense(uuid, boolean, text) from public, anon;
revoke all on function public.void_expense(uuid, text) from public, anon;
revoke all on function public.add_capital_entry(text, text, bigint, date, jsonb) from public, anon;
revoke all on function public.void_capital_entry(uuid, text) from public, anon;
revoke all on function public.record_cash_count(date, uuid, bigint, text, text) from public, anon;
revoke all on function public.recovery_detail() from public, anon;
revoke all on function public.daily_money_view(date) from public, anon;
revoke all on function public.recovery_progress() from public, anon;
revoke all on function public.finance_overview(date, date) from public, anon;
grant execute on function public.submit_expense(text, bigint, uuid, date, uuid, text, jsonb) to authenticated;
grant execute on function public.decide_expense(uuid, boolean, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.add_capital_entry(text, text, bigint, date, jsonb) to authenticated;
grant execute on function public.void_capital_entry(uuid, text) to authenticated;
grant execute on function public.record_cash_count(date, uuid, bigint, text, text) to authenticated;
grant execute on function public.recovery_detail() to authenticated;
grant execute on function public.daily_money_view(date) to authenticated;
grant execute on function public.recovery_progress() to authenticated;
grant execute on function public.finance_overview(date, date) to authenticated;
