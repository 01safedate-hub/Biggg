-- Super admin home: sales by payment channel per day / week / month (and all time), with approved expenses,
-- from the same source as the dashboard's Sales figure (daily_sales_summary: gross minus refunds, Lagos days).
create or replace function public.admin_revenue_chart(_bucket text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  _today date := private.today_lagos();
  _first date;
  _from date;
  _step interval;
begin
  perform private.require_super_admin();
  if _bucket not in ('day', 'week', 'month', 'all') then raise exception 'invalid_bucket' using errcode = 'P0001'; end if;

  select least(coalesce((select min(day) from public.daily_sales_summary), _today),
               coalesce((select min(spent_on) from public.expenses where status = 'approved'), _today))
    into _first;

  _step := case _bucket when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end;
  _from := case _bucket
    when 'day' then _today - 29
    when 'week' then date_trunc('week', _today)::date - 7 * 11
    when 'month' then (date_trunc('month', _today) - interval '11 months')::date
    else date_trunc('month', _first)::date
  end;

  return jsonb_build_object(
    'bucket', _bucket, 'from', _from, 'to', _today,
    'bars', coalesce((
      select jsonb_agg(jsonb_build_object(
               'start', b.s, 'end', least(b.e, _today),
               'modes', coalesce(m.modes, '{}'::jsonb),
               'total_kobo', coalesce(m.total, 0),
               'expenses_kobo', coalesce(x.v, 0)) order by b.s)
        from (select g::date as s, (g + _step - interval '1 day')::date as e
                from generate_series(_from::timestamp, _today::timestamp, _step) g) b
        left join lateral (
          select jsonb_object_agg(mm.mode, mm.v) as modes, sum(mm.v) as total
            from (select d.mode, sum(d.gross_kobo - d.refunded_kobo) as v
                    from public.daily_sales_summary d where d.day between b.s and b.e group by d.mode) mm) m on true
        left join lateral (
          select sum(e.amount_kobo) as v from public.expenses e
           where e.status = 'approved' and e.spent_on between b.s and b.e) x on true), '[]'::jsonb),
    'best_day', (
      select jsonb_build_object('day', t.day, 'total_kobo', t.v)
        from (select d.day, sum(d.gross_kobo - d.refunded_kobo) as v
                from public.daily_sales_summary d where d.day between _from and _today
               group by d.day order by v desc, d.day desc limit 1) t
       where t.v > 0)
  );
end
$$;
revoke all on function public.admin_revenue_chart(text) from public, anon;
grant execute on function public.admin_revenue_chart(text) to authenticated;
