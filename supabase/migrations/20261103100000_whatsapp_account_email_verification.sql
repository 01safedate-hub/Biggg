create table if not exists public.whatsapp_account_verifications (
 phone text primary key, email text not null, code_hash text, expires_at timestamptz, verified_until timestamptz,
 attempts integer not null default 0 check (attempts >= 0 and attempts <= 6), last_sent_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.whatsapp_account_verifications enable row level security;
revoke all on table public.whatsapp_account_verifications from anon, authenticated;
grant all on table public.whatsapp_account_verifications to service_role;
create index if not exists whatsapp_account_verifications_email_idx on public.whatsapp_account_verifications (lower(email));
comment on table public.whatsapp_account_verifications is 'Private service-role-only short-lived email verification state for WhatsApp account assistance. Codes are stored as SHA-256 hashes.';
