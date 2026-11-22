-- Admin only. Replace the example Google Place ID and category slug as needed.
-- Returns the assignment when inserted, or zero rows if it already exists or either input is unknown.
insert into public.place_category_assignments (place_id, category_slug)
select place.id, category.slug
from public.places as place
cross join public.place_categories as category
where place.google_place_id = 'ChIJs0kxSjWo4okR6109vVboQ64'
  and category.slug = 'food-drink'
on conflict (place_id, category_slug) do nothing
returning place_id, category_slug;

-- Readable by anon and authenticated. Replace the array with the selected category slugs.
-- A place matching multiple selected categories appears once. An empty array matches no places.
select place.id, place.google_place_id
from public.places as place
where exists (
  select 1
  from public.place_category_assignments as assignment
  where assignment.place_id = place.id
    and assignment.category_slug = any (array['food-drink', 'outdoors']::text[])
)
order by place.google_place_id;
