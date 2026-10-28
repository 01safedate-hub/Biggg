-- Integration-test outline for WhatsApp outbox foundation.
-- Run only in an isolated Supabase branch/test database after applying migrations.
begin;

do $$
declare
  _result record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='whatsapp_opt_in'
  ) then raise exception 'missing_whatsapp_opt_in'; end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='whatsapp_outbox'
  ) then raise exception 'missing_whatsapp_outbox'; end if;

  if private.normalize_whatsapp_phone('08031234567') <> '2348031234567' then raise exception 'phone_local_normalization_failed'; end if;
  if private.normalize_whatsapp_phone('+2348031234567') <> '2348031234567' then raise exception 'phone_plus_normalization_failed'; end if;
  if private.normalize_whatsapp_phone('2348031234567') <> '2348031234567' then raise exception 'phone_country_normalization_failed'; end if;

  if has_function_privilege('anon', 'public.claim_whatsapp_outbox(integer)', 'EXECUTE') then
    raise exception 'anon_can_claim_whatsapp_outbox';
  end if;
  if has_function_privilege('authenticated', 'public.claim_whatsapp_outbox(integer)', 'EXECUTE') then
    raise exception 'authenticated_can_claim_whatsapp_outbox';
  end if;

  raise notice 'RESULT WHATSAPP_FOUNDATION_PASS';
end $$;

rollback;
