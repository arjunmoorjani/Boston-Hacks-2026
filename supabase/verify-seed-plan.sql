-- Read-only check for the default one-plan import in supabase/seed-plans.sql.
-- Source order for Cannoli Showdown:
--   1. Mike's Pastry   | ChIJs0kxSjWo4okR6109vVboQ64
--   2. Modern Pastry   | ChIJT6uL2Yhw44kRQC4VpTehlhs
--   3. Bova's Bakery   | ChIJSQ-HS4lw44kRA0iC6zNgsbU

SELECT route.id AS outing_id,
       route.name AS outing_title,
       count(stop.position) OVER (PARTITION BY route.id) AS stop_count,
       stop.position,
       stop.place_id AS internal_place_id,
       place.google_place_id
FROM public.popular_routes AS route
LEFT JOIN public.popular_route_stops AS stop ON stop.popular_route_id = route.id
LEFT JOIN public.places AS place ON place.id = stop.place_id
WHERE route.id = '9eb23859-f7e3-5d7a-a83a-839e5242b70d'::uuid
ORDER BY stop.position;
