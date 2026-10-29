create or replace function public.my_order_arrival_code_issued(_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.order_codes c on c.order_id = o.id and c.step = 'arrival' and c.verified_at is null
    where o.id = _order
      and o.customer_id = auth.uid()
      and o.status = 'agent_assigned'
  );
$$;
revoke all on function public.my_order_arrival_code_issued(uuid) from public;
grant execute on function public.my_order_arrival_code_issued(uuid) to authenticated;
