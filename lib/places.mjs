const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const placesConfigured = Boolean(projectUrl && publishableKey?.startsWith("sb_publishable_"));

export const placeCategories = [
  ["food", "Food & drink"],
  ["activities", "Activities"],
  ["sports", "Sports"],
  ["shopping", "Shopping"],
  ["culture", "Culture"],
];

const pageSize = 24;

// Pass nextCursor as after to keep reading the same filtered catalog.
export async function listPlaces({ search = "", category = "", after = null, bounds, signal } = {}) {
  if (!placesConfigured) throw new Error("Supabase is not configured.");

  const url = new URL(`${projectUrl.replace(/\/+$/, "")}/rest/v1/places`);
  url.searchParams.set("select", "osm_id,name,latitude,longitude,categories,tags");
  url.searchParams.set("order", "osm_id.asc");
  url.searchParams.set("limit", String(pageSize + 1));

  const term = search.trim().replace(/[\\%_]/g, "\\$&");
  if (term) url.searchParams.set("name", `ilike.%${term}%`);
  if (category) url.searchParams.set("categories", `cs.{${category}}`);
  if (after !== null) url.searchParams.set("osm_id", `gt.${after}`);
  if (bounds) {
    url.searchParams.append("latitude", `gte.${bounds.south}`);
    url.searchParams.append("latitude", `lte.${bounds.north}`);
    if (bounds.west <= bounds.east) {
      url.searchParams.append("longitude", `gte.${bounds.west}`);
      url.searchParams.append("longitude", `lte.${bounds.east}`);
    } else {
      url.searchParams.set("or", `(longitude.gte.${bounds.west},longitude.lte.${bounds.east})`);
    }
  }

  const response = await fetch(url, { headers: { apikey: publishableKey }, signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Supabase denied access. Check the publishable key and the places read policy.");
    }
    throw new Error("Couldn’t load places from Supabase. Try again.");
  }

  const rows = await response.json();
  const places = rows.slice(0, pageSize);
  return {
    places,
    nextCursor: rows.length > pageSize ? places.at(-1).osm_id : null,
  };
}
