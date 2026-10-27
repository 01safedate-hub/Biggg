-- A station is represented by a live coverage zone (usually an area with coordinates).
-- Keep staff assignment separate from the physical coverage zone hierarchy.
alter table public.staff_profiles
  add column if not exists station_zone_id uuid references public.zones(id) on delete set null;

create index if not exists staff_profiles_station_zone_id_idx
  on public.staff_profiles(station_zone_id);

create index if not exists orders_zone_dispatch_idx
  on public.orders(zone_id, status, pickup_agent_id);
