alter table public.activity_photos
  add column stop_position integer,
  add column created_at timestamptz not null default now(),
  add constraint activity_photos_route_stop_fkey
    foreign key (activity_id, stop_position)
    references public.activity_stops (activity_id, position)
    on delete set null (stop_position);

create index activity_photos_album_order_idx
  on public.activity_photos (created_at desc, id desc);
