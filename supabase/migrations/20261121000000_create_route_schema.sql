-- One profile per Supabase Auth account.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text
);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      case when new.is_anonymous then 'Guest' end
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger create_route_app_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

-- Also covers accounts created before this migration.
insert into public.profiles (id, display_name)
select id, raw_user_meta_data ->> 'display_name'
from auth.users
on conflict (id) do nothing;

-- Save Google's stable identifier. Fetch place details when displaying a stop.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique check (btrim(google_place_id) <> '')
);

create table public.popular_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  neighborhood text,
  cover_photo_path text,
  default_transport_mode text not null default 'WALK'
    check (default_transport_mode in ('WALK', 'TRANSIT', 'DRIVE', 'BICYCLE')),
  recommended_group_size integer check (recommended_group_size > 0),
  recommended_age_range int4range
    check (
      not isempty(recommended_age_range)
      and lower(recommended_age_range) is not null
      and lower(recommended_age_range) >= 0
    ),
  budget_per_person_cents integer check (budget_per_person_cents >= 0)
);

create unique index popular_routes_name_unique
on public.popular_routes (lower(btrim(name)));

create table public.popular_route_stops (
  popular_route_id uuid not null
    references public.popular_routes(id) on delete cascade,
  position integer not null check (position > 0),
  place_id uuid not null references public.places(id),
  reservation_note text,
  primary key (popular_route_id, position),
  unique (popular_route_id, place_id)
);

create table public.tags (
  id text primary key,
  name text not null unique
);

create table public.popular_route_tags (
  popular_route_id uuid not null
    references public.popular_routes(id) on delete cascade,
  tag_id text not null references public.tags(id) on delete cascade,
  primary key (popular_route_id, tag_id)
);

insert into public.tags (id, name) values
  ('date-night', 'Date Night'),
  ('exercise', 'Exercise'),
  ('family', 'Family');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  popular_route_id uuid
    references public.popular_routes(id) on delete set null,
  name text not null check (btrim(name) <> ''),
  description text,
  neighborhood text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed')),
  started_at timestamptz,
  created_at timestamptz not null default now(),
  group_size integer check (group_size > 0),
  preferred_transport_mode text not null default 'WALK'
    check (preferred_transport_mode in ('WALK', 'TRANSIT', 'DRIVE', 'BICYCLE'))
);

create unique index activities_user_name_unique
on public.activities (user_id, lower(btrim(name)));

create table public.activity_stops (
  activity_id uuid not null references public.activities(id) on delete cascade,
  position integer not null check (position > 0),
  place_id uuid not null references public.places(id),
  arrived_at timestamptz,
  primary key (activity_id, position),
  unique (activity_id, place_id)
);

create table public.activity_photos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  storage_path text not null,
  caption text,
  unique (activity_id, storage_path)
);

-- Enable row level security on every app table.
alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.popular_routes enable row level security;
alter table public.popular_route_stops enable row level security;
alter table public.tags enable row level security;
alter table public.popular_route_tags enable row level security;
alter table public.activities enable row level security;
alter table public.activity_stops enable row level security;
alter table public.activity_photos enable row level security;

-- Give the app roles the table privileges used by the policies below.
grant select on public.places, public.popular_routes,
  public.popular_route_stops, public.tags, public.popular_route_tags
  to anon, authenticated;

grant insert on public.places to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.activities,
  public.activity_stops, public.activity_photos to authenticated;

create policy "Read places"
on public.places for select to anon, authenticated using (true);

create policy "Add places"
on public.places for insert to authenticated with check (true);

create policy "Read shared routes"
on public.popular_routes for select to anon, authenticated using (true);

create policy "Read shared stops"
on public.popular_route_stops for select to anon, authenticated using (true);

create policy "Read tags"
on public.tags for select to anon, authenticated using (true);

create policy "Read shared route tags"
on public.popular_route_tags for select to anon, authenticated using (true);

create policy "Read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Manage own activities"
on public.activities for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Manage own activity stops"
on public.activity_stops for all to authenticated
using (
  exists (
    select 1 from public.activities a
    where a.id = activity_stops.activity_id
      and a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.activities a
    where a.id = activity_stops.activity_id
      and a.user_id = (select auth.uid())
  )
);

create policy "Manage own activity photos"
on public.activity_photos for all to authenticated
using (
  exists (
    select 1 from public.activities a
    where a.id = activity_photos.activity_id
      and a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.activities a
    where a.id = activity_photos.activity_id
      and a.user_id = (select auth.uid())
  )
);