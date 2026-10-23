-- Staff onboarding records, weekly units, weekly payouts, and the private bucket for ID photos.

alter table public.staff_pay add column if not exists earns_weekly_bonus boolean not null default false;

insert into public.settings (key, value) values ('weekly_bonus', '{"units_target": null, "payout_kobo": 10000000}'::jsonb)
on conflict (key) do nothing;

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nin text, photo_path text, photo_taken_at timestamptz, date_of_birth date, home_address text,
  referee_name text, referee_phone text, referee_address text, referee_relationship text,
  next_of_kin_name text, next_of_kin_phone text,
  bank_name text, bank_account_number text, bank_account_name text,
  onboarding_status text not null default 'incomplete' check (onboarding_status in ('incomplete', 'submitted', 'verified', 'rejected')),
  review_note text, verified_by uuid references auth.users(id) on delete set null, verified_at timestamptz,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint nin_format check (nin is null or nin ~ '^\d{11}$'),
  constraint bank_account_format check (bank_account_number is null or bank_account_number ~ '^\d{10}$')
);
create unique index staff_profiles_nin_key on public.staff_profiles (nin) where nin is not null;
alter table public.staff_profiles enable row level security;
create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super_admin()));
revoke all on public.staff_profiles from anon, authenticated;
grant select on public.staff_profiles to authenticated;
create trigger staff_profiles_touch before update on public.staff_profiles for each row execute function private.touch_updated_at();
create trigger staff_profiles_audit after insert or update on public.staff_profiles for each row execute function private.audit_row();

create table public.unit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  units integer not null check (units between 1 and 5000),
  order_id uuid references public.orders(id) on delete set null,
  note text, logged_by uuid references auth.users(id) on delete set null,
  logged_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users(id) on delete set null, void_reason text
);
create index unit_log_staff_time on public.unit_log (staff_id, logged_at);
alter table public.unit_log enable row level security;
create policy unit_log_read on public.unit_log for select to authenticated using ((select private.is_admin()));
revoke all on public.unit_log from anon, authenticated;
grant select on public.unit_log to authenticated;
create trigger unit_log_audit after insert or update on public.unit_log for each row execute function private.audit_row();

create table public.weekly_payouts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, units integer not null, target_units integer not null, amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'earned' check (status in ('earned', 'paid')),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  paid_by uuid references auth.users(id) on delete set null, paid_at timestamptz,
  unique (staff_id, week_start)
);
alter table public.weekly_payouts enable row level security;
create policy weekly_payouts_read on public.weekly_payouts for select to authenticated
  using (staff_id = (select auth.uid()) or (select private.is_super_admin()));
revoke all on public.weekly_payouts from anon, authenticated;
grant select on public.weekly_payouts to authenticated;
create trigger weekly_payouts_audit after insert or update on public.weekly_payouts for each row execute function private.audit_row();

-- Private bucket: staff can add files only to their own folder, the super admin to any folder. Files are never public and never overwritten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-docs', 'staff-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy staff_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-docs' and (select private.is_active())
    and (((storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_staff())) or (select private.is_super_admin())));
create policy staff_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'staff-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_super_admin())));
