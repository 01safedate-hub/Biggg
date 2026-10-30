-- Durable inbox for customer-originated WhatsApp messages.
-- This migration intentionally does not enable automated AI replies; the inbound
-- processor must be deployed and configured before messages are consumed.
create table if not exists public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  from_phone text not null,
  message_type text not null,
  message_text text,
  provider_timestamp timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_ready_idx
  on public.whatsapp_inbound_messages (run_after, received_at)
  where status in ('queued', 'failed');

alter table public.whatsapp_inbound_messages enable row level security;

-- Inbox data is service-only. No client roles receive table access.
revoke all on public.whatsapp_inbound_messages from anon, authenticated;
grant all on public.whatsapp_inbound_messages to service_role;

comment on table public.whatsapp_inbound_messages is
  'Deduplicated inbound WhatsApp messages awaiting the separately deployed AI processor. Service-role only.';
