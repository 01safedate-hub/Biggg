-- RECONSTRUCTED SOURCE — not byte-for-byte recovery of the lost original migration.
-- Derived from production's create_extra_clothes_payment_intent and adjacent
-- checked-in migrations on 2026-10-28. Do not replay on production.
-- Overage is charged online at the server-calculated amount stored on the pickup.

create or replace function public.create_extra_clothes_payment_intent(_pickup uuid, _provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _pickup_row public.subscription_pickups;
  _sub public.subscriptions;
  _invoice public.subscription_invoices;
  _profile public.profiles;
  _reference text;
  _payment uuid;
begin
  if auth.uid() is null or not private.is_active() then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
  if _provider not in ('paystack', 'flutterwave') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;

  select * into _pickup_row
  from public.subscription_pickups where id = _pickup for update;
  if not found then raise exception 'bill_not_found' using errcode = 'P0001'; end if;

  select * into _sub
  from public.subscriptions
  where id = _pickup_row.subscription_id and customer_id = auth.uid()
  for update;
  if not found then raise exception 'bill_not_found' using errcode = 'P0001'; end if;

  if coalesce(_pickup_row.overage_pieces, 0) <= 0 or coalesce(_pickup_row.overage_kobo, 0) <= 0 then
    raise exception 'nothing_to_pay' using errcode = 'P0001';
  end if;
  if private.online_money_point() is null then
    raise exception 'no_online_money_point' using errcode = 'P0001';
  end if;

  select * into _invoice
  from public.subscription_invoices
  where subscription_pickup_id = _pickup_row.id
  for update;

  if found and _invoice.status = 'paid' then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;

  if not found then
    insert into public.subscription_invoices (
      subscription_id, subscription_pickup_id, period_start, period_end, amount_kobo, status
    ) values (
      _sub.id, _pickup_row.id, current_date, current_date, _pickup_row.overage_kobo, 'due'
    ) returning * into _invoice;
  else
    update public.subscription_invoices
       set amount_kobo = _pickup_row.overage_kobo, status = 'due'
     where id = _invoice.id;
  end if;

  update public.payments set status = 'failed'
   where invoice_id = _invoice.id and status = 'pending';

  _reference := 'LP-EXTRA-' || replace(_pickup_row.id::text, '-', '') || '-' ||
    encode(extensions.gen_random_bytes(5), 'hex');

  insert into public.payments (
    invoice_id, customer_id, purpose, kind, mode, amount_kobo, reference,
    status, money_point_id, note
  ) values (
    _invoice.id, auth.uid(), 'extra_clothes', 'payment', _provider,
    _pickup_row.overage_kobo, _reference, 'pending', private.online_money_point(),
    'Extra clothes: ' || _pickup_row.overage_pieces || ' pieces'
  ) returning id into _payment;

  update public.subscription_invoices set payment_id = _payment where id = _invoice.id;
  select * into _profile from public.profiles where id = auth.uid();

  return jsonb_build_object(
    'reference', _reference, 'amount_kobo', _pickup_row.overage_kobo,
    'email', _profile.email, 'name', _profile.full_name, 'phone', _profile.phone,
    'plan_name', 'Extra clothes', 'subscription_id', _sub.id
  );
end;
$function$;

revoke execute on function public.create_extra_clothes_payment_intent(uuid, text) from public, anon;
grant execute on function public.create_extra_clothes_payment_intent(uuid, text) to authenticated;
