-- Expose only the names of enabled online payment providers to signed-in customers.
-- Customers must not receive read access to money point balances or bank details.
create or replace function public.active_payment_providers()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(
    case
      when lower(trim(mp.name)) like '%paystack%' then 'paystack'
      when lower(trim(mp.name)) like '%flutterwave%' then 'flutterwave'
      else null
    end
  ) filter (where lower(trim(mp.name)) like '%paystack%' or lower(trim(mp.name)) like '%flutterwave%'), array[]::text[])
  from public.money_points mp
  where mp.kind = 'online' and mp.active = true;
$$;

revoke all on function public.active_payment_providers() from public, anon;
grant execute on function public.active_payment_providers() to authenticated;
