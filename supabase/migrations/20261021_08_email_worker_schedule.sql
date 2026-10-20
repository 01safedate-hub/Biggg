create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Shared secret for the cron -> worker call. Generated inside the database; never shown or stored in code.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_worker_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'email_worker_secret', 'Auth for the email-worker edge function');
  end if;
end $$;

-- Only the service role (the worker) may check the secret.
create or replace function public.verify_worker_secret(_s text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(_s <> '' and _s = (select decrypted_secret from vault.decrypted_secrets where name = 'email_worker_secret' limit 1), false);
$$;
revoke all on function public.verify_worker_secret(text) from public, anon, authenticated;
grant execute on function public.verify_worker_secret(text) to service_role;

-- Run the worker every 5 minutes.
select cron.schedule(
  'email-worker-every-5-min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://aqxitpnektmkjpfbbfhz.supabase.co/functions/v1/email-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_worker_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
