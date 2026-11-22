export const POPULAR_COUNT = 6;

export async function loadSharedRoutes(supabase) {
  const { data, error } = await supabase.from("popular_routes")
    .select("id, name, completed_users, popular_route_stops(position, places(google_place_id))");
  if (error) throw error;

  return data.map(route => ({
    id: route.id,
    name: route.name,
    completedUsers: route.completed_users,
    placeIds: [...route.popular_route_stops].sort((a, b) => a.position - b.position)
      .map(stop => stop.places?.google_place_id),
  }));
}

const normalizedName = name => name.trim().toLowerCase();

export function matchSharedRoute(routes, stops, title) {
  if (!stops.length || stops.some(stop => !stop.placeId)) return null;

  const matches = routes.filter(route =>
    (title === undefined || normalizedName(route.name) === normalizedName(title))
    && route.placeIds.length === stops.length
    && route.placeIds.every((id, index) => id === stops[index].placeId));
  return matches.length === 1 ? matches[0] : null;
}

export function rankSharedWalks(walks, routes) {
  return walks.map(walk => {
    const route = matchSharedRoute(routes, walk.stops, walk.title);
    return route ? { ...walk, popularRouteId: route.id, completedUsers: route.completedUsers } : walk;
  }).sort((a, b) => (b.completedUsers ?? 0) - (a.completedUsers ?? 0));
}

export function popularWalkIds(walks, count = POPULAR_COUNT) {
  return new Set(walks.filter(walk => walk.completedUsers > 0).slice(0, count).map(walk => walk.id));
}
