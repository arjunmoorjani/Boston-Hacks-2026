import { loadGoogleMaps } from "./google-maps.mjs";

const pageSize = 500;

async function readSavedPlaceIds(supabase, limit) {
  const ids = [];
  while (ids.length < limit) {
    let query = supabase.from("places").select("google_place_id")
      .order("google_place_id", { ascending: true })
      .limit(Math.min(pageSize, limit - ids.length));
    if (ids.length) query = query.gt("google_place_id", ids.at(-1));

    const { data, error } = await query;
    if (error) throw new Error(`Couldn’t read saved place IDs: ${error.message}`);
    if (!data.length) break;
    ids.push(...data.map(place => place.google_place_id));
  }
  return ids;
}

// Each run makes one Place Details request per selected Google Place ID.
export async function groupSavedPlaces({ limit = Infinity } = {}) {
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) {
    throw new RangeError("The place limit must be a positive integer.");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Configure the Supabase URL and publishable key before grouping saved places.");
  }

  const { supabase } = await import("./supabase.mjs");
  const { data: categories, error } = await supabase.from("place_categories")
    .select("slug, label, google_search_types")
    .order("slug", { ascending: true });
  if (error) throw new Error(`Couldn’t read place categories: ${error.message}`);
  if (!categories.length) throw new Error("No place categories found. Check that the category migration has been applied.");

  const groups = categories.map(category => ({ ...category, googlePlaceIds: [] }));
  const unmatchedIds = [];
  const failedLookups = [];
  const ids = await readSavedPlaceIds(supabase, limit);
  const result = { groups, unmatchedIds, failedLookups };
  if (!ids.length) return result;

  const maps = await loadGoogleMaps();
  const { Place } = await maps.importLibrary("places");
  for (const googlePlaceId of ids) {
    let types;
    try {
      const { place } = await new Place({ id: googlePlaceId }).fetchFields({ fields: ["types"] });
      types = new Set(place.types);
    } catch (error) {
      failedLookups.push({ googlePlaceId, message: error?.message || String(error) });
      continue;
    }

    let matched = false;
    for (const group of groups) {
      if (group.google_search_types.some(type => types.has(type))) {
        group.googlePlaceIds.push(googlePlaceId);
        matched = true;
      }
    }
    if (!matched) unmatchedIds.push(googlePlaceId);
  }
  return result;
}
