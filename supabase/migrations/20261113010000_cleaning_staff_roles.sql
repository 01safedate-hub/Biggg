-- Cleaning service staff roles. Added in their own migration because a new enum value
-- cannot be used in the same transaction that adds it.
alter type public.staff_role add value if not exists 'inspector';
alter type public.staff_role add value if not exists 'cleaning_lead';
alter type public.staff_role add value if not exists 'cleaner';
alter type public.staff_role add value if not exists 'scheduler';
