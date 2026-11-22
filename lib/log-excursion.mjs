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

  const { supabase } = await import("./supabase.mjs");
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  const userId = session?.user?.id;
  if (!userId) throw new Error("Couldn’t start a secure photo upload session.");

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

  const uploaded = [];
  try {
    const googleStops = locations.filter(location => location.placeId);
    if (googleStops.length) {
      const uniquePlaceIds = [...new Set(googleStops.map(location => location.placeId))];
      const { error: placeError } = await supabase.from("places").upsert(
        uniquePlaceIds.map(googlePlaceId => ({ google_place_id: googlePlaceId })),
        { onConflict: "google_place_id", ignoreDuplicates: true },
      );
      if (placeError) throw placeError;
      const { data: places, error: lookupError } = await supabase.from("places")
        .select("id, google_place_id").in("google_place_id", uniquePlaceIds);
      if (lookupError) throw lookupError;
      const placeIds = new Map(places.map(place => [place.google_place_id, place.id]));
      const seen = new Set();
      const stopRows = locations.flatMap((location, index) => {
        if (!location.placeId || seen.has(location.placeId) || !placeIds.has(location.placeId)) return [];
        seen.add(location.placeId);
        return [{ activity_id: activity.id, place_id: placeIds.get(location.placeId), position: index + 1 }];
      });
      if (stopRows.length) {
        const { error: stopsError } = await supabase.from("activity_stops").insert(stopRows);
        if (stopsError) throw stopsError;
      }
    }

    for (const file of images) {
      const path = `${userId}/${activity.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded.push(path);
    }
    if (uploaded.length) {
      const { error: photosError } = await supabase.from("activity_photos").insert(
        uploaded.map(storagePath => ({ activity_id: activity.id, storage_path: storagePath })),
      );
      if (photosError) throw photosError;
    }
    return { activityId: activity.id, photoPaths: uploaded };
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from("activities").delete().eq("id", activity.id);
    throw error;
  }
}
