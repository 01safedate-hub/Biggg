-- WhatsApp inbound processor support: auditable human handoff and atomic queue claiming.
create table if not exists public.whatsapp_handoffs (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid not null unique references public.whatsapp_inbound_messages(id) on delete cascade,
  from_phone text not null,
  reason text not null,
  message_text text,
  status text not null default 'open' check (status in ('open','assigned','resolved','dismissed')),
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.whatsapp_handoffs enable row level security;
revoke all on public.whatsapp_handoffs from anon, authenticated;
grant all on public.whatsapp_handoffs to service_role;
create index if not exists whatsapp_handoffs_open_idx on public.whatsapp_handoffs(created_at) where status in ('open','assigned');

create or replace function public.whatsapp_claim_inbound_messages(_limit integer default 10)
returns setof public.whatsapp_inbound_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.whatsapp_inbound_messages
    where (
      (status in ('queued','failed') and run_after <= now())
      or (status = 'processing' and updated_at < now() - interval '5 minutes')
    )
    and attempts < 5
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(_limit, 10), 25))
  )
  update public.whatsapp_inbound_messages m
     set status = 'processing',
         attempts = m.attempts + 1,
         updated_at = now(),
         last_error = null
    from picked
   where m.id = picked.id
  returning m.*;
end;
$$;
revoke all on function public.whatsapp_claim_inbound_messages(integer) from public, anon, authenticated;
grant execute on function public.whatsapp_claim_inbound_messages(integer) to service_role;

-- Limit inbound volume to 30 messages per sender in a rolling hour.
create or replace function public.whatsapp_inbound_rate_allowed(_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select count(*) <= 30
  from public.whatsapp_inbound_messages
  where from_phone = _phone
    and received_at >= now() - interval '1 hour';
$$;
revoke all on function public.whatsapp_inbound_rate_allowed(text) from public, anon, authenticated;
grant execute on function public.whatsapp_inbound_rate_allowed(text) to service_role;

-- Retention cleanup is intentionally callable only by the service role / scheduled maintenance.
create or replace function public.whatsapp_purge_old_inbound()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.whatsapp_inbound_messages
   where received_at < now() - interval '90 days'
     and status in ('processed','ignored','failed');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.whatsapp_purge_old_inbound() from public, anon, authenticated;
grant execute on function public.whatsapp_purge_old_inbound() to service_role;
