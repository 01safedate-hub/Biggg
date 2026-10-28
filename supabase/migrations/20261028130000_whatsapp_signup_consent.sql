-- Persist explicit WhatsApp consent submitted during account sign-up.
-- Existing profiles keep the column's default false; no historical consent is inferred.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare _code text;
begin
  loop
    _code := 'LP-' || private.gen_code(5);
    exit when not exists (select 1 from public.profiles where customer_code = _code);
  end loop;

  insert into public.profiles
    (id, full_name, phone, email, customer_code, marketing_opt_in,
     whatsapp_opt_in, whatsapp_opt_in_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    new.email,
    _code,
    coalesce(new.raw_user_meta_data->>'marketing_opt_in', 'false') = 'true',
    coalesce((new.raw_user_meta_data->>'whatsapp_opt_in')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'whatsapp_opt_in')::boolean, false) then now() else null end
  );
  return new;
end;
$$;
