export async function resolvePlaceIds(supabase, googlePlaceIds) {
  const ids = [...new Set(googlePlaceIds)];
  if (!ids.length) return new Map();

  const { error: placeError } = await supabase.from("places").upsert(
    ids.map(googlePlaceId => ({ google_place_id: googlePlaceId })),
    { onConflict: "google_place_id", ignoreDuplicates: true },
  );
  if (placeError) throw placeError;

  const { data: places, error: lookupError } = await supabase.from("places")
    .select("id, google_place_id").in("google_place_id", ids);
  if (lookupError) throw lookupError;
  const placeIds = new Map(places.map(place => [place.google_place_id, place.id]));
  if (ids.some(id => !placeIds.has(id))) throw new Error("Could not load all the selected stops.");
  return placeIds;
}

export async function deleteUnfinishedActivity(supabase, activityId) {
  try {
    const { error } = await supabase.from("activities").delete().eq("id", activityId);
    if (error) throw error;

    const { data, error: lookupError } = await supabase.from("activities")
      .select("id").eq("id", activityId).maybeSingle();
    if (lookupError) throw lookupError;
    if (data) throw new Error("The unfinished outing still exists.");
  } catch (error) {
    throw new Error("Could not confirm removal of the unfinished outing. Please retry.", { cause: error });
  }
}

export async function insertActivityStop(supabase, activityId, position, placeId) {
  const { error } = await supabase.from("activity_stops").insert({
    activity_id: activityId, position, place_id: placeId,
  });
  if (!error) return;

  // A retry may follow a request that committed before the client received its response.
  const { data, error: lookupError } = await supabase.from("activity_stops")
    .select("place_id").eq("activity_id", activityId).eq("position", position).maybeSingle();
  if (lookupError || data?.place_id !== placeId) throw error;
}

export async function loadActivityStopIds(supabase, activityId) {
  const { data, error } = await supabase.from("activity_stops")
    .select("position, places(google_place_id)").eq("activity_id", activityId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data.map(stop => {
    if (!stop.places?.google_place_id) throw new Error("Could not load a saved stop.");
    return stop.places.google_place_id;
  });
}
