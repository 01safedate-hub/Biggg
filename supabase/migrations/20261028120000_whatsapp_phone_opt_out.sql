-- Webhook STOP events need a reliable E.164 lookup regardless of how the phone was saved.
-- Profiles may retain their legacy formatting, so compare using the same normalizer.
create or replace function public.whatsapp_opt_out_by_phone(_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n text := private.normalize_whatsapp_phone(_phone);
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if n is null then return false; end if;
  update public.profiles p
     set whatsapp_opt_in = false, whatsapp_opt_out_at = now()
   where private.normalize_whatsapp_phone(p.phone) = n;
  if not found then return false; end if;
  update public.whatsapp_outbox w
     set status = 'cancelled', last_error = 'customer_stop_opt_out', updated_at = now()
   where w.user_id in (
     select p.id from public.profiles p where private.normalize_whatsapp_phone(p.phone) = n
   ) and w.status in ('queued','processing');
  return true;
end;
$$;
revoke all on function public.whatsapp_opt_out_by_phone(text) from public, anon, authenticated;
grant execute on function public.whatsapp_opt_out_by_phone(text) to service_role;
