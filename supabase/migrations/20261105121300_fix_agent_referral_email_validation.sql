-- Correct the escaped dot in the agent referral email validator.
-- The previous expression rejected ordinary email addresses.
create or replace function public.create_agent_referral(_full_name text, _email text, _phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _id uuid;
  v_email text := lower(btrim(coalesce(_email,'')));
  v_name text := btrim(coalesce(_full_name,''));
  v_phone text := btrim(coalesce(_phone,''));
begin
  if auth.uid() is null or not private.is_active()
     or not (private.has_role('commission_agent'::public.staff_role)
          or private.has_role('delivery_agent'::public.staff_role)) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_name'; end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'invalid_email'; end if;
  if length(regexp_replace(v_phone,'[^0-9]','','g')) not between 10 and 15 then raise exception 'invalid_phone'; end if;
  if exists(select 1 from auth.users u where lower(u.email)=v_email) then raise exception 'account_already_exists'; end if;
  insert into public.agent_applications(referred_by,full_name,email,phone)
  values(auth.uid(),v_name,v_email,v_phone)
  returning id into _id;
  return _id;
exception when unique_violation then
  raise exception 'agent_already_referred';
end
$$;
revoke all on function public.create_agent_referral(text,text,text) from public, anon;
grant execute on function public.create_agent_referral(text,text,text) to authenticated;
