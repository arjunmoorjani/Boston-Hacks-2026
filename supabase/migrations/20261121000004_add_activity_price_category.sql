alter table public.activities
  add column if not exists price_category text
    check (price_category in ('FREE', '$', '$$', '$$$'));

comment on column public.activities.price_category is
  'User-selected price tier for a logged excursion: FREE, $, $$, or $$$.';
