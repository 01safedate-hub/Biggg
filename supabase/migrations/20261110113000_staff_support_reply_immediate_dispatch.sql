-- Dispatch staff WhatsApp replies immediately; the minute worker remains the retry path.
create or replace function public.staff_support_reply(_phone text, _body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare qid uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(_body,'')))=0 or length(_body)>3500 then raise exception 'invalid_message'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,last_staff_reply_at,updated_at)
 values(_phone,'human',auth.uid(),now(),null,now(),now())
 on conflict(phone) do update set mode='human',assigned_to=auth.uid(),last_staff_reply_at=now(),response_due_at=null,updated_at=now();
 insert into public.whatsapp_outbox(to_phone,event,template,variables,condition,idempotency_key)
 values(_phone,'staff_reply','freeform_text',jsonb_build_object('text_body',trim(_body)), '{}'::jsonb,'staff-reply-'||gen_random_uuid()::text) returning id into qid;
 insert into public.whatsapp_conversation_messages(phone,direction,body,delivery_status) values(_phone,'outbound',trim(_body),'queued');
 perform public.invoke_whatsapp_worker();
 return qid;
end;
$$;
