const PHOTO_BUCKET = "activity-photos";
export const PHOTO_PAGE_SIZE = 24;

// The route save keeps the first occurrence of each Google Place ID at its original position.
export function photoStopOptions(locations) {
  const seen = new Set();
  return locations.flatMap(({ placeId, label }, index) => {
    if (!placeId || seen.has(placeId)) return [];
    seen.add(placeId);
    return [{ placeId, label: label || `Stop ${index + 1}`, position: index + 1 }];
  });
}

export async function loadPhotoAlbum(client, offset = 0) {
  const { data: { session }, error: authError } = await client.auth.getSession();
  if (authError) throw authError;
  if (!session) return { photos: [], hasMore: false };

  const { data, error } = await client.from("activity_photos")
    .select("id, storage_path, stop_position, activities!inner(id, name, popular_route_id), activity_stops!activity_photos_route_stop_fkey(places(google_place_id))")
    .eq("activities.user_id", session.user.id)
    .eq("activities.status", "completed")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PHOTO_PAGE_SIZE);
  if (error) throw error;
  const rows = data.slice(0, PHOTO_PAGE_SIZE);
  if (!rows.length) return { photos: [], hasMore: false };

  const { data: signed, error: storageError } = await client.storage.from(PHOTO_BUCKET)
    .createSignedUrls(rows.map(row => row.storage_path), 3600);
  if (storageError) throw storageError;
  const urls = new Map(signed.map(item => [item.path, item.signedUrl]));

  return {
    hasMore: data.length > PHOTO_PAGE_SIZE,
    photos: rows.map(row => ({
      id: row.id,
      url: urls.get(row.storage_path) ?? null,
      route: { id: row.activities.id, title: row.activities.name, sharedRouteId: row.activities.popular_route_id },
      stopPosition: row.stop_position,
      placeId: row.activity_stops?.places?.google_place_id ?? null,
    })),
  };
}

export async function loadPhotoRoute(client, id) {
  const { data, error } = await client.from("activities")
    .select("description, started_at, created_at, activity_stops(position, places(google_place_id))")
    .eq("id", id)
    .single();
  if (error) throw error;

  return {
    description: data.description,
    date: data.started_at ?? data.created_at,
    stops: data.activity_stops.toSorted((a, b) => a.position - b.position).map(stop => ({
      position: stop.position,
      placeId: stop.places?.google_place_id ?? null,
    })),
  };
}
