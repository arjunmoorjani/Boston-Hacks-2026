import { deleteUnfinishedActivity, insertActivityStop, loadActivityStopIds, resolvePlaceIds } from "./activity-stops.mjs";

import { photoStopOptions } from "./route-photos.mjs";

const BUCKET = "activity-photos";
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const loggedExcursionDatabaseReady = configured;

const safeFileName = name => String(name || "photo.jpg")
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "photo.jpg";

export async function saveLoggedExcursion({ activityId = null, name, date, priceCategory = "FREE", peopleWith = 0, comments, locations, images = [], popularRouteId = null }) {
  if (!configured) {
    if (images.length) throw new Error("Connect Supabase before uploading route photos.");
    return { activityId: null, photoPaths: [] };
  }

  const stops = photoStopOptions(locations);
  const validPositions = new Set(stops.map(stop => stop.position));
  if (images.some(({ stopPosition }) => stops.length ? !validPositions.has(stopPosition) : stopPosition != null)) {
    throw new Error("Choose a route stop for each photo.");
  }

  const { supabase, userId } = await excursionSession();

  const startedAt = new Date(`${date}T12:00:00`).toISOString();
  const companionCount = Math.max(0, Math.floor(Number(peopleWith) || 0));
  const activityChanges = {
    name: name.trim(),
    description: comments.trim() || null,
    status: "completed",
    popular_route_id: popularRouteId,
    started_at: startedAt,
    price_category: priceCategory,
    group_size: companionCount + 1,
  };
  const activityQuery = activityId
    ? supabase.from("activities").select("id").eq("id", activityId).in("status", ["active", "completed"])
    : supabase.from("activities").insert(activityChanges).select("id");
  const { data: activity, error: activityError } = await activityQuery.single();
  if (activityError) throw activityError;

  try {
    if (!activityId && stops.length) {
      const placeIds = await resolvePlaceIds(supabase, stops.map(stop => stop.placeId));
      const { error: stopsError } = await supabase.from("activity_stops").insert(stops.map(stop => ({
        activity_id: activity.id, place_id: placeIds.get(stop.placeId), position: stop.position,
      })));
      if (stopsError) throw stopsError;
    }

    const photoPaths = await uploadExcursionPhotos(supabase, userId, activity.id, images);
    if (activityId) {
      const { error } = await supabase.from("activities").update(activityChanges)
        .eq("id", activityId).in("status", ["active", "completed"]).select("id").single();
      if (error) throw error;
    }
    return { activityId: activity.id, photoPaths };
  } catch (error) {
    if (!activityId) await deleteUnfinishedActivity(supabase, activity.id);
    throw error;
  }
}

async function excursionSession() {
  if (!configured) throw new Error("Connect Supabase to save an active route.");
  const { supabase } = await import("./supabase.mjs");
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const userId = session?.user?.id;
  if (!userId) throw new Error("Couldn’t start a secure route session.");

  return { supabase, userId };
}

async function uploadExcursionPhotos(supabase, userId, activityId, images) {
  if (!images.length) return [];
  const bucket = supabase.storage.from(BUCKET);
  const photos = images.map(({ id, file, stopPosition }) => ({
    file, activity_id: activityId, stop_position: stopPosition,
    storage_path: `${userId}/${activityId}/${id}-${safeFileName(file.name)}`,
  }));
  const paths = photos.map(photo => photo.storage_path);
  const photoRows = () => supabase.from("activity_photos").select("storage_path, stop_position")
    .eq("activity_id", activityId).in("storage_path", paths);
  const { data: existing, error: lookupError } = await photoRows();
  if (lookupError) throw lookupError;
  const saved = new Set(existing.map(photo => photo.storage_path));
  const uploaded = [];
  try {
    for (const { file, storage_path: path } of photos) {
      if (saved.has(path)) continue;
      const { error } = await bucket.upload(path, file, {
        contentType: file.type || "image/jpeg", upsert: false,
      });
      // A prior attempt can have stored the file before its metadata was saved.
      if (error && Number(error.statusCode) !== 409 && Number(error.status) !== 409) throw error;
      if (!error) uploaded.push(path);
    }
    const { error } = await supabase.from("activity_photos").upsert(
      photos.map(({ file, ...row }) => row), { onConflict: "activity_id,storage_path" },
    );
    if (error) {
      const { data: confirmed, error: confirmationError } = await photoRows();
      if (confirmationError) {
        // Keep files on an uncertain response so retrying cannot strand committed photo rows.
        uploaded.length = 0;
        throw error;
      }
      const positions = new Map(confirmed.map(row => [row.storage_path, row.stop_position]));
      if (photos.every(row => positions.get(row.storage_path) === row.stop_position)) return paths;
      const unlinked = uploaded.filter(path => !positions.has(path));
      uploaded.splice(0, uploaded.length, ...unlinked);
      throw error;
    }
    return paths;
  } catch (error) {
    if (uploaded.length) await bucket.remove(uploaded);
    throw error;
  }
}

const transportModes = { WALKING: "WALK", TRANSIT: "TRANSIT", DRIVING: "DRIVE", BICYCLING: "BICYCLE" };

export async function startActiveExcursion({ activityId, name, mode, startedAt, firstStop }) {
  const googlePlaceId = firstStop.placeId;
  if (!googlePlaceId) throw new Error("Choose a place or address with a Google Place ID for your first stop.");
  const { supabase } = await excursionSession();
  const placeIds = await resolvePlaceIds(supabase, [googlePlaceId]);
  const { error } = await supabase.from("activities").upsert({
    id: activityId,
    name,
    status: "active",
    started_at: startedAt,
    preferred_transport_mode: transportModes[mode],
  }, { onConflict: "id" }).select("id").single();
  if (error) throw error;

  try {
    await insertActivityStop(supabase, activityId, 1, placeIds.get(googlePlaceId));
  } catch (stopError) {
    await deleteUnfinishedActivity(supabase, activityId);
    throw stopError;
  }
}

export async function addActiveExcursionStop(activityId, position, googlePlaceId) {
  const { supabase } = await excursionSession();
  const placeIds = await resolvePlaceIds(supabase, [googlePlaceId]);
  await insertActivityStop(supabase, activityId, position, placeIds.get(googlePlaceId));
}

export async function loadActiveExcursionStopIds(activityId) {
  const { supabase } = await excursionSession();
  return loadActivityStopIds(supabase, activityId);
}

export async function updateActiveExcursion(activityId, changes) {
  const { supabase } = await excursionSession();
  const update = supabase.from("activities").update(changes).eq("id", activityId);
  if (changes.status === "completed") update.in("status", ["active", "completed"]);
  else update.eq("status", "active");
  const { error } = await update.select("id").single();
  if (error) throw error;
}

export async function completeSharedRoute({ activityId, popularRouteId, startedAt }) {
  const { supabase } = await excursionSession();
  const { error } = await supabase.rpc("complete_shared_route", {
    p_activity_id: activityId,
    p_route_id: popularRouteId,
    p_started_at: startedAt,
  });
  if (error) throw error;
}

export async function deleteLoggedExcursion({ activityId, photoPaths = [] }) {
  if (!activityId) return;
  if (!configured) throw new Error("Connect Supabase before deleting this route from the database.");

  const { supabase } = await import("./supabase.mjs");
  let paths = photoPaths.filter(Boolean);
  if (!paths.length) {
    const { data: photos, error: photosError } = await supabase.from("activity_photos")
      .select("storage_path").eq("activity_id", activityId);
    if (photosError) throw photosError;
    paths = (photos ?? []).map(photo => photo.storage_path).filter(Boolean);
  }
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError) throw storageError;
  }
  const { error: activityError } = await supabase.from("activities").delete().eq("id", activityId);
  if (activityError) throw activityError;
}
