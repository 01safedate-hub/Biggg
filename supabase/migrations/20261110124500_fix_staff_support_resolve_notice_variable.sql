-- Fix the customer notification variable used when resolving a support conversation.
-- Keep the UUID-scoped resolver used by the staff inbox.
create or replace function public.staff_support_resolve(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_phone text;
  v_user_id uuid;
  v_to_phone text;
  _notice text := 'This conversation has been marked as resolved. Thank you for choosing LaundryPoint!';
begin
  if not public.staff_support_allowed() then
    raise exception 'support_access_denied' using errcode='42501';
  end if;

  update public.whatsapp_support_conversations
  set mode='resolved', assigned_to=auth.uid(), resolved_at=now(), response_due_at=null, updated_at=now()
  where id=_conversation_id and mode<>'resolved'
  returning phone into v_phone;

  if v_phone is null then
    raise exception 'conversation_already_resolved';
  end if;

  update public.whatsapp_handoffs
  set status='resolved', assigned_to=auth.uid(), resolved_at=now()
  where from_phone=v_phone and status in ('open','assigned');

  v_to_phone := private.normalize_whatsapp_phone(v_phone);

  select p.id into v_user_id
  from public.whatsapp_account_verifications v
  join public.profiles p on p.id=v.customer_id
  where private.normalize_whatsapp_phone(v.phone)=v_to_phone
    and v.customer_id is not null
    and p.whatsapp_opt_in is true
    and p.whatsapp_opt_out_at is null
  order by v.verified_until desc nulls last, v.updated_at desc
  limit 1;

  if v_user_id is not null and exists (
    select 1 from public.whatsapp_conversation_messages m
    where m.conversation_id=_conversation_id
      and m.direction='inbound'
      and m.created_at>=now()-interval '24 hours'
  ) then
    insert into public.whatsapp_outbox(user_id,to_phone,event,template,variables,status,condition,idempotency_key,run_after)
    values(v_user_id,v_to_phone,'support_resolved','support_resolved',jsonb_build_object('text_body',_notice),'queued','{}'::jsonb,
      'support-resolved:'||v_to_phone||':'||txid_current()::text,now())
    on conflict(idempotency_key) do nothing;

    insert into public.whatsapp_conversation_messages(phone,conversation_id,direction,body,delivery_status)
    select v_phone,_conversation_id,'outbound',_notice,'queued'
    where exists (
      select 1 from public.whatsapp_outbox o
      where o.idempotency_key='support-resolved:'||v_to_phone||':'||txid_current()::text
    );
  end if;
end
$function$;
