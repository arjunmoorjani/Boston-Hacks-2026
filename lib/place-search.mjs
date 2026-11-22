// Finding places by name from the search bar: stops on our walks first (instant, no API call), then Google's
// Places Autocomplete suggestions near Boston. Picking one opens its place card (app/place-profile.jsx).

import { loadGoogleMaps } from "./google-maps.mjs";

export const MIN_GOOGLE_CHARS = 3;  // don't call Google for one or two letters
export const MAX_RESULTS = 6;
const BOSTON = { lat: 42.355, lng: -71.065 };
const RADIUS_M = 20_000;

const norm = text => String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "");

/** Stops on our walks whose name has every word of the query ("mikes pastry" finds "Mike's Pastry"). */
export function localPlaceMatches(places, query, limit = 4) {
  const words = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return places
    .filter(place => words.every(word => norm(place.name).includes(word)))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.name.length - b.name.length)
    .slice(0, limit)
    .map(place => ({
      // addresses on our stops often start with the name again ("Modern Pastry, 257 Hanover St"): drop it
      placeId: place.placeId, name: place.name, point: [place.lat, place.lng],
      detail: String(place.address || "").replace(new RegExp(`^${place.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`, "i"), ""),
      onWalks: place.popularity ?? 1, source: "walks",
    }));
}

/** Our stops first, then Google's, without repeats, at most MAX_RESULTS. */
export function mergePlaceResults(local, google) {
  const seen = new Set(local.map(item => item.placeId));
  return [...local, ...google.filter(item => !seen.has(item.placeId))].slice(0, MAX_RESULTS);
}

let sessionToken = null; // Google bills a typing session as one when the same token is reused
const cache = new Map();

/** Google's place suggestions for what's typed, biased to Boston. Cached per query. */
export async function googlePlaceSuggestions(query) {
  const input = query.trim();
  if (input.length < MIN_GOOGLE_CHARS) return [];
  const key = norm(input);
  if (cache.has(key)) return cache.get(key);
  const maps = await loadGoogleMaps();
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary("places");
  sessionToken ??= new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input, sessionToken, includedRegionCodes: ["us"],
    locationBias: { center: BOSTON, radius: RADIUS_M },
  });
  const results = (suggestions ?? []).map(item => item.placePrediction).filter(Boolean).map(prediction => ({
    placeId: prediction.placeId,
    name: prediction.mainText?.text ?? prediction.text?.text ?? "Place",
    detail: prediction.secondaryText?.text ?? "",
    point: null,
    source: "google",
  }));
  cache.set(key, results);
  return results;
}

/** Call after a place is picked: the next search starts a new billing session. */
export function endPlaceSearchSession() {
  sessionToken = null;
}
