-- Expense transparency: every active staff member can see approved expenses and their proof.
-- Real naira amounts and vendor are shown only to super_admin and accountant; everyone else
-- sees the effect as a percentage of capital and of the monthly target.
insert into public.settings (key, value) values ('targets', '{"monthly_net_kobo": null}'::jsonb)
on conflict (key) do nothing;

create or replace function private.can_view_expense_proof(_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff() and private.is_active() and exists (
    select 1 from public.evidence e join public.expenses x on x.id = e.expense_id
     where e.storage_path = _path and x.status in ('approved','voided') and x.decided_by is not null) $$;

create policy evidence_view_staff on storage.objects for select to authenticated
  using (bucket_id = 'expense-evidence' and (select private.can_view_expense_proof(name)));

create or replace function public.expense_feed(_limit integer default 50, _before date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _money boolean; _cap bigint; _target bigint; _r jsonb;
begin
  if not private.is_staff() or not private.is_active() then raise exception 'not_staff' using errcode = 'P0001'; end if;
  _money := private.is_super_admin() or private.has_role('accountant');
  select coalesce(sum(amount_kobo), 0) into _cap from public.capital_entries where status = 'approved' and kind = 'capital';
  select nullif((value->>'monthly_net_kobo')::bigint, 0) into _target from public.settings where key = 'targets';

  select coalesce(jsonb_agg(s.item order by s.sort_day desc, s.sort_ts desc), '[]'::jsonb) into _r from (
    select x.spent_on as sort_day, x.created_at as sort_ts, jsonb_build_object(
      'id', x.id, 'label', x.label, 'category', c.name, 'spent_on', x.spent_on, 'status', x.status,
      'recorded_by', coalesce(rb.full_name, 'Unknown'), 'approved_by', coalesce(ab.full_name, 'Unknown'),
      'amount_kobo', case when _money then x.amount_kobo end,
      'vendor', case when _money then x.vendor end,
      'void_reason', case when x.status = 'voided' then x.void_reason end,
      'capital_setback_pct', case when _cap > 0 then round(x.amount_kobo::numeric * 100 / _cap, 2) end,
      'target_setback_pct', case when _target is not null then round(x.amount_kobo::numeric * 100 / _target, 2) end,
      'proofs', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'path', e.storage_path) order by e.created_at)
                            from public.evidence e where e.expense_id = x.id), '[]'::jsonb)
    ) as item
    from public.expenses x
    left join public.expense_categories c on c.id = x.category_id
    left join public.profiles rb on rb.id = x.entered_by
    left join public.profiles ab on ab.id = x.decided_by
    where x.status in ('approved', 'voided') and x.decided_by is not null and (_before is null or x.spent_on < _before)
    order by x.spent_on desc, x.created_at desc
    limit least(greatest(_limit, 1), 100)
  ) s;
  return _r;
end $$;

revoke execute on function public.expense_feed(integer, date) from public, anon;
grant execute on function public.expense_feed(integer, date) to authenticated;
