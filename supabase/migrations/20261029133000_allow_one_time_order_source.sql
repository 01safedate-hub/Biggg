-- Permit the source value used by the one-time pickup checkout.
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source = any (array['online'::text,'walk_in'::text,'whatsapp'::text,'subscription'::text,'one_time'::text]));
