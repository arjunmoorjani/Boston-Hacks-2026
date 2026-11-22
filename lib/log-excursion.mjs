import { deleteUnfinishedActivity, insertActivityStop, loadActivityStopIds, resolvePlaceIds } from "./activity-stops.mjs";

const BUCKET = "activity-photos";
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const loggedExcursionDatabaseReady = configured;

const safeFileName = name => String(name || "photo.jpg")
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "photo.jpg";

export async function saveLoggedExcursion({ name, date, priceCategory = "FREE", peopleWith = 0, comments, locations, images = [] }) {
  if (!configured) {
    if (images.length) throw new Error("Connect Supabase before uploading excursion photos.");
    return { activityId: null, photoPaths: [] };
  }

  const { supabase, userId } = await excursionSession();

  const startedAt = new Date(`${date}T12:00:00`).toISOString();
  const companionCount = Math.max(0, Math.floor(Number(peopleWith) || 0));
  const { data: activity, error: activityError } = await supabase.from("activities").insert({
    name: name.trim(),
    description: comments.trim() || null,
    status: "completed",
    started_at: startedAt,
    price_category: priceCategory,
    group_size: companionCount + 1,
  }).select("id").single();
  if (activityError) throw activityError;

  try {
    const googleStops = locations.filter(location => location.placeId);
    if (googleStops.length) {
      const placeIds = await resolvePlaceIds(supabase, googleStops.map(stop => stop.placeId));
      const seen = new Set();
      const stopRows = locations.flatMap((location, index) => {
        if (!location.placeId || seen.has(location.placeId)) return [];
        seen.add(location.placeId);
        return [{ activity_id: activity.id, place_id: placeIds.get(location.placeId), position: index + 1 }];
      });
      if (stopRows.length) {
        const { error: stopsError } = await supabase.from("activity_stops").insert(stopRows);
        if (stopsError) throw stopsError;
      }
    }

    const photoPaths = await uploadExcursionPhotos(supabase, userId, activity.id, images);
    return { activityId: activity.id, photoPaths };
  } catch (error) {
    await deleteUnfinishedActivity(supabase, activity.id);
    throw error;
  }
}

async function excursionSession() {
  if (!configured) throw new Error("Connect Supabase to save an active excursion.");
  const { supabase } = await import("./supabase.mjs");
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const userId = session?.user?.id;
  if (!userId) throw new Error("Couldn’t start a secure excursion session.");

  return { supabase, userId };
}

async function uploadExcursionPhotos(supabase, userId, activityId, images) {
  const uploaded = [];
  try {
    for (const file of images) {
      const path = `${userId}/${activityId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded.push(path);
    }
    if (uploaded.length) {
      const { error: photosError } = await supabase.from("activity_photos").insert(
        uploaded.map(storagePath => ({ activity_id: activityId, storage_path: storagePath })),
      );
      if (photosError) throw photosError;
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
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

export async function deleteLoggedExcursion({ activityId, photoPaths = [] }) {
  if (!activityId) return;
  if (!configured) throw new Error("Connect Supabase before deleting this excursion from the database.");

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
