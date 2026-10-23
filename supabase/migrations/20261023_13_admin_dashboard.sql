-- One call that feeds the super admin overview: totals for a period and the equal period before it, daily series and breakdowns.
create or replace function private.dash_totals(_from date, _to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _rev bigint; _ref bigint; _txn bigint; _exp bigint; _o jsonb; _cust bigint; _wl bigint; _short bigint; _counts bigint; _late bigint; _sur bigint;
begin
  select coalesce(sum(gross_kobo - refunded_kobo), 0), coalesce(sum(refunded_kobo), 0), coalesce(sum(txn_count), 0)
    into _rev, _ref, _txn from public.daily_sales_summary where day between _from and _to;
  select coalesce(sum(amount_kobo), 0) into _exp from public.expenses where status = 'approved' and spent_on between _from and _to;
  select jsonb_build_object('total', count(*), 'delivered', count(*) filter (where status in ('delivered', 'closed')),
           'cancelled', count(*) filter (where status in ('cancelled', 'failed_delivery')))
    into _o from public.orders where (created_at at time zone 'Africa/Lagos')::date between _from and _to;
  select count(*) into _cust from public.profiles p where (p.created_at at time zone 'Africa/Lagos')::date between _from and _to
     and not exists (select 1 from public.user_roles r where r.user_id = p.id);
  select count(*) into _wl from public.waitlist where (created_at at time zone 'Africa/Lagos')::date between _from and _to;
  select coalesce(sum(least(difference_kobo, 0)), 0), count(*) into _short, _counts from public.cash_counts where day between _from and _to;
  select coalesce(sum(minutes_late), 0), coalesce(sum(surcharge_kobo), 0) into _late, _sur from public.attendance
    where (checked_in_at at time zone 'Africa/Lagos')::date between _from and _to;
  return jsonb_build_object('revenue_kobo', _rev, 'refunds_kobo', _ref, 'payments', _txn, 'expenses_kobo', _exp, 'profit_kobo', _rev - _exp,
    'avg_ticket_kobo', case when _txn > 0 then round(_rev::numeric / _txn) else 0 end,
    'orders', _o, 'new_customers', _cust, 'waitlist', _wl, 'cash_short_kobo', _short, 'cash_counts', _counts,
    'late_minutes', _late, 'lateness_surcharge_kobo', _sur);
end $$;

create or replace function public.admin_dashboard(_from date, _to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _len int; _pt date; _pf date;
begin
  perform private.require_super_admin();
  if _from is null or _to is null or _to < _from or _to - _from > 366 then raise exception 'range_invalid' using errcode = 'P0001'; end if;
  _len := _to - _from + 1; _pt := _from - 1; _pf := _pt - (_len - 1);
  return jsonb_build_object(
    'from', _from, 'to', _to, 'prev_from', _pf, 'prev_to', _pt,
    'cur', private.dash_totals(_from, _to), 'prev', private.dash_totals(_pf, _pt),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', g.d, 'revenue_kobo', coalesce(s.rev, 0), 'online_kobo', coalesce(s.onl, 0),
               'expenses_kobo', coalesce(e.v, 0), 'orders', coalesce(o.n, 0)) order by g.d)
      from generate_series(_from, _to, interval '1 day') as gs(d0), lateral (select gs.d0::date as d) g
      left join (select day, sum(gross_kobo - refunded_kobo) rev, sum(gross_kobo - refunded_kobo) filter (where mode = 'paystack') onl
                   from public.daily_sales_summary where day between _from and _to group by day) s on s.day = g.d
      left join (select spent_on, sum(amount_kobo) v from public.expenses where status = 'approved' and spent_on between _from and _to group by spent_on) e on e.spent_on = g.d
      left join (select (created_at at time zone 'Africa/Lagos')::date od, count(*) n from public.orders
                   where (created_at at time zone 'Africa/Lagos')::date between _from and _to group by 1) o on o.od = g.d), '[]'::jsonb),
    'by_mode', coalesce((select jsonb_object_agg(mode, v) from (select mode, sum(gross_kobo - refunded_kobo) v from public.daily_sales_summary
                where day between _from and _to group by mode) m), '{}'::jsonb),
    'by_purpose', coalesce((select jsonb_object_agg(purpose, v) from (select purpose,
                sum(case when kind = 'refund' then -amount_kobo else amount_kobo end) v from public.payments
                where status = 'success' and (coalesce(paid_at, created_at) at time zone 'Africa/Lagos')::date between _from and _to group by purpose) p), '{}'::jsonb),
    'by_money_point', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(mp.name, 'Unassigned'), 'total_kobo', t.v) order by t.v desc) from (
                select money_point_id, sum(gross_kobo - refunded_kobo) v from public.daily_sales_summary where day between _from and _to group by money_point_id) t
                left join public.money_points mp on mp.id = t.money_point_id), '[]'::jsonb),
    'by_cashier', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Online'), 'total_kobo', t.v) order by t.v desc) from (
                select cashier_id, sum(gross_kobo - refunded_kobo) v from public.daily_sales_summary where day between _from and _to group by cashier_id) t
                left join public.profiles p on p.id = t.cashier_id), '[]'::jsonb),
    'expense_by_category', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c.name, 'Other'), 'total_kobo', t.v) order by t.v desc) from (
                select category_id, sum(amount_kobo) v from public.expenses where status = 'approved' and spent_on between _from and _to group by category_id) t
                left join public.expense_categories c on c.id = t.category_id), '[]'::jsonb),
    'orders_by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from public.orders
                where (created_at at time zone 'Africa/Lagos')::date between _from and _to group by source) s), '{}'::jsonb),
    'orders_by_status', coalesce((select jsonb_object_agg(status::text, n) from (select status, count(*) n from public.orders
                where (created_at at time zone 'Africa/Lagos')::date between _from and _to group by status) s), '{}'::jsonb),
    'waitlist_areas', coalesce((select jsonb_agg(jsonb_build_object('area', a, 'n', n) order by n desc) from (
                select coalesce(nullif(trim(detected_area), ''), 'Unknown') a, count(*) n from public.waitlist group by 1 order by 2 desc limit 5) w), '[]'::jsonb),
    'now', jsonb_build_object('open_orders', (select count(*) from public.orders where status not in ('closed', 'cancelled', 'delivered')),
                'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
                'pending_expenses', (select count(*) from public.expenses where status = 'pending'),
                'staff', (select count(distinct user_id) from public.user_roles),
                'customers', (select count(*) from public.profiles p where not exists (select 1 from public.user_roles r where r.user_id = p.id)),
                'waitlist_total', (select count(*) from public.waitlist))
  );
end $$;

revoke execute on function public.admin_dashboard(date, date) from public, anon;
grant execute on function public.admin_dashboard(date, date) to authenticated;
