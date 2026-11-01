-- Track cashier contact attempts without creating placeholder pickup rows.
-- Planned contact records never count against the subscription's two-pickup limit.
create table if not exists public.subscription_pickup_contacts (
  id uuid primary key default gen_random_uuid(),
  subscription_pickup_id uuid not null references public.subscription_pickups(id) on delete cascade,
  outcome text not null default 'pending' check (outcome in ('pending','confirmed','reschedule_requested','skipped','no_answer')),
  notes text check (notes is null or length(notes) <= 500),
  contacted_by uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_pickup_id)
);
create index if not exists subscription_pickup_contacts_outcome_idx
  on public.subscription_pickup_contacts(outcome, contacted_at);
alter table public.subscription_pickup_contacts enable row level security;
revoke all on public.subscription_pickup_contacts from anon, authenticated;
