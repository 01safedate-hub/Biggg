-- Inbound customer-initiated replies are distinct from proactive WhatsApp notifications.
-- A false opt-in flag means no outbound notification consent; it must not suppress
-- a reply to a message the customer just sent. Only an explicit opt-out blocks replies.
create or replace function public.whatsapp_is_opted_out_by_phone(_phone text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where private.normalize_whatsapp_phone(p.phone) = private.normalize_whatsapp_phone(_phone)
      and p.whatsapp_opt_out_at is not null
  );
$$;
revoke all on function public.whatsapp_is_opted_out_by_phone(text) from public, anon, authenticated;
grant execute on function public.whatsapp_is_opted_out_by_phone(text) to service_role;
