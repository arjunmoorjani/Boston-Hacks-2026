create table public.place_categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (btrim(label) <> ''),
  display_order integer not null check (display_order > 0),
  google_search_types text[] not null check (cardinality(google_search_types) > 0)
);

create table public.place_category_assignments (
  place_id uuid not null references public.places(id) on delete cascade,
  category_slug text not null references public.place_categories(slug) on delete cascade,
  primary key (place_id, category_slug)
);

create index place_category_assignments_category_idx
  on public.place_category_assignments (category_slug, place_id);

alter table public.place_categories enable row level security;
alter table public.place_category_assignments enable row level security;

-- Database owners and the server-side service role manage assignments.
revoke all on public.place_categories, public.place_category_assignments
  from public, anon, authenticated;
grant select on public.place_categories, public.place_category_assignments
  to anon, authenticated;
grant select, insert, update, delete on public.place_categories, public.place_category_assignments
  to service_role;

create policy "Read place categories"
  on public.place_categories for select to anon, authenticated using (true);

create policy "Read place category assignments"
  on public.place_category_assignments for select to anon, authenticated using (true);

insert into public.place_categories (slug, label, display_order, google_search_types)
values
  ('food-drink', 'Food & Drink', 1, array['restaurant', 'cafe', 'bakery', 'bar']),
  ('outdoors', 'Outdoors', 2, array['park', 'hiking_area', 'botanical_garden']),
  ('arts-culture', 'Arts & Culture', 3,
    array['museum', 'art_gallery', 'historical_landmark', 'performing_arts_theater']),
  ('entertainment', 'Entertainment', 4,
    array['movie_theater', 'bowling_alley', 'amusement_center', 'go_karting_venue', 'miniature_golf_course', 'aquarium']),
  ('sports-fitness', 'Sports & Fitness', 5,
    array['sports_complex', 'sports_club', 'athletic_field', 'tennis_court', 'ice_skating_rink']),
  ('shopping-markets', 'Shopping & Markets', 6,
    array['shopping_mall', 'book_store', 'gift_shop', 'market', 'farmers_market']);
