begin;

-- Planned and active outings still reserve their name. Finished outings may be repeated.
drop index public.activities_user_name_unique;
create unique index activities_user_name_unique
  on public.activities (user_id, lower(btrim(name))) where status <> 'completed';

create index activities_shared_route_completions_idx
  on public.activities (popular_route_id, user_id)
  where status = 'completed' and popular_route_id is not null;

alter table public.popular_routes
  add column completed_users integer not null default 0 check (completed_users >= 0);

create schema if not exists private;

-- Only the count is shared. Activity rows retain their existing ownership policies.
create function private.refresh_shared_route_completions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_route uuid;
  new_route uuid;
  route_id uuid;
begin
  if tg_op <> 'INSERT' and old.status = 'completed' then
    old_route := old.popular_route_id;
  end if;
  if tg_op <> 'DELETE' and new.status = 'completed' then
    new_route := new.popular_route_id;
  end if;

  -- Serialize recounts and use the same lock order when moving an activity.
  for route_id in
    select r.id from public.popular_routes r
    where r.id in (old_route, new_route)
    order by r.id
    for no key update
  loop
    update public.popular_routes r
    set completed_users = (
      select count(distinct a.user_id)
      from public.activities a
      where a.popular_route_id = route_id and a.status = 'completed'
    )
    where r.id = route_id;
  end loop;
  return null;
end;
$$;

revoke all on function private.refresh_shared_route_completions() from public, anon, authenticated;

create trigger refresh_shared_route_completions
after insert or delete or update of popular_route_id, status, user_id on public.activities
for each row execute function private.refresh_shared_route_completions();

update public.popular_routes r
set completed_users = counts.completed_users
from (
  select popular_route_id, count(distinct user_id) as completed_users
  from public.activities
  where status = 'completed' and popular_route_id is not null
  group by popular_route_id
) counts
where r.id = counts.popular_route_id;

-- Finishing a plan creates its activity and ordered stops in one transaction.
-- The caller supplies the activity UUID so a retry can reuse the same record.
create function public.complete_shared_route(
  p_activity_id uuid, p_route_id uuid, p_started_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before completing a shared route.' using errcode = '42501';
  end if;

  insert into public.activities (id, popular_route_id, name, status, started_at, preferred_transport_mode)
  select p_activity_id, r.id, r.name, 'completed', p_started_at, r.default_transport_mode
  from public.popular_routes r
  where r.id = p_route_id
    and exists (select 1 from public.popular_route_stops s where s.popular_route_id = r.id)
  on conflict (id) do nothing;

  if found then
    insert into public.activity_stops (activity_id, position, place_id)
    select p_activity_id, s.position, s.place_id
    from public.popular_route_stops s
    where s.popular_route_id = p_route_id;
  elsif not exists (
    select 1 from public.activities a
    where a.id = p_activity_id and a.user_id = (select auth.uid())
      and a.popular_route_id = p_route_id and a.status = 'completed'
  ) then
    raise exception 'This shared route could not be completed.';
  end if;
end;
$$;

revoke all on function public.complete_shared_route(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.complete_shared_route(uuid, uuid, timestamptz) to authenticated;

commit;
