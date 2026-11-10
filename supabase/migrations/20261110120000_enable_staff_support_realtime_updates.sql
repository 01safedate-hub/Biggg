do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_conversation_messages') then
   alter publication supabase_realtime add table public.whatsapp_conversation_messages;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_support_conversations') then
   alter publication supabase_realtime add table public.whatsapp_support_conversations;
 end if;
end $$;
drop policy if exists staff_support_realtime_messages_read on public.whatsapp_conversation_messages;
create policy staff_support_realtime_messages_read on public.whatsapp_conversation_messages
for select to authenticated using (public.staff_support_allowed());
drop policy if exists staff_support_realtime_conversations_read on public.whatsapp_support_conversations;
create policy staff_support_realtime_conversations_read on public.whatsapp_support_conversations
for select to authenticated using (public.staff_support_allowed());
grant select on public.whatsapp_conversation_messages, public.whatsapp_support_conversations to authenticated;
