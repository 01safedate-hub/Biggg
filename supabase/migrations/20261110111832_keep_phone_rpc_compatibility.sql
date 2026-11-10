-- Keep the legacy phone-based RPC signatures compatible without mutating resolved history.
create or replace function public.staff_support_takeover(_phone text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 v_id:=public.whatsapp_active_support_conversation(_phone);
 perform public.staff_support_takeover(v_id);
end $$;

create or replace function public.staff_support_return_ai(_phone text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 select id into v_id from public.whatsapp_support_conversations
 where phone=_phone and mode<>'resolved' order by created_at desc limit 1;
 if v_id is null then raise exception 'conversation_not_active'; end if;
 perform public.staff_support_return_ai(v_id);
end $$;

create or replace function public.staff_support_reply(_phone text,_body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 select id into v_id from public.whatsapp_support_conversations
 where phone=_phone and mode<>'resolved' order by created_at desc limit 1;
 if v_id is null then raise exception 'conversation_not_active'; end if;
 return public.staff_support_reply(v_id,_body);
end $$;

create or replace function public.staff_support_resolve(_phone text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 select id into v_id from public.whatsapp_support_conversations
 where phone=_phone and mode<>'resolved' order by created_at desc limit 1;
 if v_id is null then raise exception 'conversation_not_active'; end if;
 perform public.staff_support_resolve(v_id);
end $$;
