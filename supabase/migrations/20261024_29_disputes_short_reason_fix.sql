-- Applied via apply_migration: disputes_short_reason_fix
create or replace function public.record_dispute_from_provider(_reference text, _provider text, _external text, _reason text, _due timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _p public.payments; _id uuid; _s uuid; _why text := trim(coalesce(_reason, ''));
begin
  if _provider not in ('paystack','flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  if length(_why) < 3 then _why := 'Customer disputed the charge with their bank'; end if;
  select * into _p from public.payments where reference = _reference and kind = 'payment' and status = 'success';
  if not found then return null; end if;
  insert into public.payment_disputes (payment_id, order_id, provider, external_ref, amount_kobo, reason, due_at)
  values (_p.id, _p.order_id, _provider, left(_external, 100), _p.amount_kobo, left(_why, 500), _due)
  on conflict (payment_id) where status in ('open','evidence_sent') do nothing
  returning id into _id;
  if _id is not null then
    insert into public.order_events (order_id, event, detail) values (_p.order_id, 'dispute_opened', jsonb_build_object('dispute_id', _id, 'provider', _provider));
    for _s in select user_id from public.user_roles where role = 'super_admin' loop
      insert into public.user_notifications (user_id, title, body, kind, order_id) values (_s, 'A customer disputed a payment', 'Respond before ' || coalesce(to_char(_due at time zone 'Africa/Lagos', 'DD Mon'), 'the deadline') || '. The clothes are on hold.', 'dispute', _p.order_id);
    end loop;
  end if;
  return _id;
end $$;
revoke execute on function public.record_dispute_from_provider(text,text,text,text,timestamptz) from public, anon, authenticated;
