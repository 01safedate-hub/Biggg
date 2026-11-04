-- Add the dedicated washer staff role. Keep this isolated because a new PostgreSQL enum value
-- cannot be referenced by SQL functions until the ALTER TYPE transaction has committed.
alter type public.staff_role add value if not exists 'washer';
