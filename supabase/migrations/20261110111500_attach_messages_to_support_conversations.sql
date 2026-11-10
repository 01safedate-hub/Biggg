-- Attach every newly inserted WhatsApp message to the active conversation.
-- This also covers internal workflow-state messages inserted directly by the processor.
create or replace function public.whatsapp_attach_message_conversation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.conversation_id is null then
    new.conversation_id:=public.whatsapp_active_support_conversation(new.phone);
  end if;
  return new;
end $$;
drop trigger if exists whatsapp_conversation_message_attach_conversation on public.whatsapp_conversation_messages;
create trigger whatsapp_conversation_message_attach_conversation
before insert on public.whatsapp_conversation_messages
for each row execute function public.whatsapp_attach_message_conversation();

-- Ensure legacy message-only phone numbers also appear in the inbox and are backfilled.
insert into public.whatsapp_support_conversations(phone,mode,updated_at)
select distinct m.phone,'ai',now()
from public.whatsapp_conversation_messages m
where not exists(select 1 from public.whatsapp_support_conversations c where c.phone=m.phone)
on conflict do nothing;
update public.whatsapp_conversation_messages m
set conversation_id=c.id
from public.whatsapp_support_conversations c
where m.conversation_id is null and m.phone=c.phone;

create index if not exists whatsapp_support_conversations_active_phone_idx
on public.whatsapp_support_conversations(phone,created_at desc)
where mode<>'resolved';
