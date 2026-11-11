-- Applied live on 2026-11-11 (data only):
-- * Coverage widened to 15 km from the Ifite hub: service_area.multiplier set so depth_km = 15
--   (refresh_service_area sets the hub service area radius and turns on auto-live areas inside 15 km).
-- * Test zones "Owerri west" and "Amawbia locati" switched off.
-- * Opening time 09:00 (closing stays 18:00); hub address updated.
update public.settings set value = value || jsonb_build_object('multiplier', round((15.0 / private.distance_km(6.251056, 7.100335, 6.215, 7.048))::numeric, 6)) where key = 'service_area';
update public.zones set is_live = false where name in ('Owerri west', 'Amawbia locati') and not auto_live;
update public.settings set value = jsonb_set(value, '{opening_time}', '"09:00"'::jsonb) where key = 'business';
update public.settings set value = value || jsonb_build_object('address', 'D''Pikins Apartment, Flat B2, opposite Wennys Plaza, Book Foundation, Ifite, Awka 420112, Anambra') where key = 'hub';
