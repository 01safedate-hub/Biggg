-- Automatic WhatsApp notifications foundation for LaundryPoint.
-- Provider sending stays disabled until Meta credentials/templates have been configured.
-- Designed to extend existing in-app/email notification paths without calling the provider from SQL triggers.

alter table public.profiles
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_opt_out_at timestamptz;

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  to_phone text not null,
  event text not null,
  template text not null,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','processing','sent','delivered','read','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  provider_message_id text,
  last_error text,
  condition jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_outbox_ready_idx
  on public.whatsapp_outbox (run_after, created_at)
  where status = 'queued';
create index if not exists whatsapp_outbox_order_event_idx
  on public.whatsapp_outbox (order_id, event, status);

alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_outbox to service_role;

-- Normalize Nigerian local and international forms into Meta's digits-only E.164 recipient format.
create or replace function private.normalize_whatsapp_phone(_phone text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(_phone, ''), '\\D', '', 'g');
begin
  if d = '' then return null; end if;
  if left(d, 1) = '0' and length(d) = 11 then
    d := '234' || substr(d, 2);
  elsif left(d, 1) = '+'" then
    d := substr(d, 2);
  elsif length(d) = 10 then
    d := '234' || d;
  end if;
  if d !~ '^234[789][01][0-9]{8}$' then
    return null;
  end if;
  return d;
end;
$$;
revoke all on function private.normalize_whatsapp_phone(text) from public, anon, authenticated;
grant execute on function private.normalize_whatsapp_phone(text) to service_role;

-- A single enqueue helper. The outbox itself is private and has a unique idempotency key,
-- so caller retries and at-least-once cron execution do not produce duplicate messages.
create or replace function private.enqueue_whatsapp(
  _user uuid,
  _order uuid,
  _event text,
  _template text,
  _variables jsonb default '{}'::jsonb,
  _run_after timestamptz default now(),
  _condition jsonb default '{}'::jsonb,
  _key text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  n text;
  new_id uuid;
begin
  if _event = '' or _template = '' then return null; end if;
  select * into p from public.profiles where id = _user;
  if not found or not p.whatsapp_opt_in or p.whatsapp_opt_out_at is not null then return null; end if;
  n := private.normalize_whatsapp_phone(p.phone);
  if n is null then return null; end if;

  insert into public.whatsapp_outbox
    (user_id, order_id, to_phone, event, template, variables, run_after, condition, idempotency_key)
  values
    (_user, _order, _event, _template, coalesce(_variables, '{}'::jsonb),
     greatest(coalesce(_run_after, now()), now()), coalesce(_condition, '{}'::jsonb),
     coalesce(_key, 'wa-' || coalesce(_order::text, 'user-' || _user::text) || '-' || _event))
  on conflict (idempotency_key) do nothing
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function private.enqueue_whatsapp(uuid,uuid,text,text,jsonb,timestamptz,jsonb,text) from public, anon, authenticated;
grant execute on function private.enqueue_whatsapp(uuid,uuid,text,text,jsonb,timestamptz,jsonb,text) to service_role;

-- Customers may update only their own consent; opt-in and opt-out timestamps are auditable.
create or replace function public.set_whatsapp_opt_in(_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  update public.profiles
     set whatsapp_opt_in = coalesce(_on, false),
         whatsapp_opt_in_at = case when coalesce(_on, false) then now() else whatsapp_opt_in_at end,
         whatsapp_opt_out_at = case when coalesce(_on, false) then null else now() end
   where id = auth.uid();
end;
$$;
revoke all on function public.set_whatsapp_opt_in(boolean) from public, anon;
grant execute on function public.set_whatsapp_opt_in(boolean) to authenticated;

-- Grant the worker a separate Vault-backed caller secret, never the service-role credential.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'whatsapp_worker_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'whatsapp_worker_secret',
      'Auth for the WhatsApp worker Edge Function'
    );
  end if;
end
$$;

create or replace function public.verify_whatsapp_worker_secret(_s text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(_s <> '' and _s = (
    select decrypted_secret from vault.decrypted_secrets
    where name = 'whatsapp_worker_secret' limit 1
  ), false);
$$;
revoke all on function public.verify_whatsapp_worker_secret(text) from public, anon, authenticated;
grant execute on function public.verify_whatsapp_worker_secret(text) to service_role;

-- One-minute cadence is needed for the 15-minute/2-hour/24-hour/72-hour reminders.
-- Worker will process at most 50 rows and enforce quiet hours and current-state conditions.
select cron.schedule(
  'whatsapp-worker-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://aqxitpnektmkjpfbbfhz.supabase.co/functions/v1/whatsapp-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_worker_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
