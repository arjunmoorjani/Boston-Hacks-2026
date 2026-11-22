// Our own place markers while exploring, in place of Google's icons: the places come from Google's Nearby Search
// for the area on screen, drawn with our icons in Google's category colors and labeled in the app's font.
//
// Nearby Search returns at most 20 places per call and each call is billed, so: only from neighborhood zoom in, two
// calls per ~400 m grid cell (places, then parks and T stations), a few new cells at a time, and every cell remembered for the browser session.
//
// What shows when follows Google's own rules: a place's prominence (its popularity rank in its area) decides the
// zoom it appears at, landmarks and parks a level earlier; icons that would overlap a more prominent one wait for
// a closer zoom (the overlap check is in app/google-boston-map.jsx).

import { loadGoogleMaps } from "./google-maps.mjs";
import { placeIconFor } from "./map-style.mjs";

export const MIN_ZOOM = 15;          // farther out than this, no markers (and no calls)
export const LABEL_ZOOM = 16;        // names next to the markers from here (where they fit)
export const CELL_DEG = 0.004;       // grid cell size, about 440 m north–south in Boston
export const MAX_NEW_CELLS = 4;      // new calls per pan or zoom at most
const RADIUS_M = 320;                // covers a cell (center to corner)
const STORAGE_KEY = "routable.nearby.v4"; // v2 adds T and rail stations to the protected label layer

/** Google-style colors per icon: food orange, shopping blue, parks green, culture purple, and so on. */
export const CATEGORY_COLORS = Object.freeze({
  restaurant: "#F57C00", cafe: "#F57C00", bakery: "#F57C00", bar: "#F57C00",
  shopping: "#4285F4", books: "#4285F4",
  park: "#34A853",
  train: "#1B2A4A",
  museum: "#8E63CE", landmark: "#8E63CE", church: "#8E63CE",
  venue: "#D6409F",
  hotel: "#E37BA8",
  water: "#1A9BD7", aquarium: "#1A9BD7",
  bridge: "#7B8389", street: "#7B8389", place: "#7B8389",
});
export const colorFor = icon => CATEGORY_COLORS[icon] ?? CATEGORY_COLORS.place;

// What to ask for: places worth walking to. (Nearby Search takes up to 50 types.)
const INCLUDED_TYPES = [
  "restaurant", "cafe", "coffee_shop", "bakery", "bar", "ice_cream_shop", "dessert_shop",
  "museum", "art_gallery", "tourist_attraction", "historical_landmark", "book_store", "library",
  "market", "shopping_mall", "clothing_store", "gift_shop", "performing_arts_theater", "movie_theater", "aquarium",
];
// Parks and T stations get a search of their own: in busy areas the top 20 above are all restaurants and shops,
// and these names are always shown on the map.
const PARK_AND_T_TYPES = ["park", "national_park", "dog_park", "subway_station", "light_rail_station", "train_station", "transit_station"];

/** The grid cells (keys and centers) covering a map view's bounds. */
export function cellsFor({ north, south, east, west }) {
  const cells = [];
  for (let i = Math.floor(south / CELL_DEG); i <= Math.floor(north / CELL_DEG); i++) {
    for (let j = Math.floor(west / CELL_DEG); j <= Math.floor(east / CELL_DEG); j++) {
      cells.push({ key: `${i}:${j}`, center: [(i + 0.5) * CELL_DEG, (j + 0.5) * CELL_DEG] });
    }
  }
  return cells;
}

/** Cells nearest the view's center first, so the middle of the screen fills in before the edges. */
export function byDistanceTo(center, cells) {
  const d = cell => (cell.center[0] - center[0]) ** 2 + (cell.center[1] - center[1]) ** 2;
  return [...cells].sort((a, b) => d(a) - d(b));
}

/** A Nearby Search place -> what the map needs. `rank` is its popularity order in its area (0 = most popular). */
export function toMarkerPlace(place, rank = 0) {
  const icon = placeIconFor(place.primaryType, place.displayName);
  return {
    placeId: place.id,
    name: place.displayName || "Place",
    point: place.location ? [place.location.lat(), place.location.lng()] : null,
    icon,
    color: colorFor(icon),
    rank,
    type: place.primaryType ?? null,
  };
}

// Places people navigate by show a level earlier than shops and restaurants, as on Google's map.
const LANDMARKS = new Set(["museum", "landmark", "park", "aquarium", "church", "venue", "train"]);

/** The closest-out zoom a place shows at: the top of each area from 15, more at 16, everything at 17. */
export function minZoomFor(place) {
  const base = place.rank < 3 ? 15 : place.rank < 8 ? 16 : 17;
  return LANDMARKS.has(place.icon) ? Math.max(MIN_ZOOM, base - 1) : base;
}

/** Most prominent first: shows earliest, then popularity rank. The overlap check keeps the earlier ones. */
export function byProminence(places) {
  return [...places].sort((a, b) => minZoomFor(a) - minZoomFor(b) || a.rank - b.rank);
}

const cells = new Map(); // cell key -> Promise<places[]>
let parkSearchFailed = false;
/** True once a park-and-T search has failed this session: our park and T names may be missing, so keep Google's. */
export const parkNamesUnavailable = () => parkSearchFailed;
let restored = false;

function restore() {
  if (restored) return;
  restored = true;
  try {
    for (const [key, places] of Object.entries(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}"))) {
      // each cell's list is in popularity order, so places saved before ranks existed get theirs from it
      cells.set(key, Promise.resolve(places.map((place, index) => ({ ...place, rank: place.rank ?? index }))));
    }
  } catch {}
}

async function persist() {
  try {
    const entries = await Promise.all([...cells].map(async ([key, request]) => [key, await request.catch(() => null)]));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.filter(([, places]) => places))));
  } catch {}
}

/** Two searches per cell: places to go, and parks with T stations. Each list keeps its own popularity ranks. */
async function searchCell(center) {
  const maps = await loadGoogleMaps();
  const { Place, SearchNearbyRankPreference } = await maps.importLibrary("places");
  const search = includedTypes => Place.searchNearby({
    fields: ["id", "displayName", "location", "primaryType"],
    locationRestriction: { center: { lat: center[0], lng: center[1] }, radius: RADIUS_M },
    includedTypes,
    maxResultCount: 20,
    rankPreference: SearchNearbyRankPreference?.POPULARITY ?? "POPULARITY",
  }).then(({ places }) => (places ?? []).map((place, rank) => toMarkerPlace(place, rank)).filter(place => place.point));
  const [spots, parksAndT] = await Promise.allSettled([search(INCLUDED_TYPES), search(PARK_AND_T_TYPES)]);
  if (spots.status === "rejected") throw spots.reason;
  if (parksAndT.status === "rejected") parkSearchFailed = true; // the map then keeps Google's park and T names
  // the park search also returns benches, statues and offices that merely have a park among their types
  const kept = parksAndT.status === "fulfilled" ? parksAndT.value.filter(place => isTStation(place) || isRealPark(place)) : [];
  return [...spots.value, ...kept]; // parks and T are a bonus
}

/**
 * Places for the cells on screen: cached cells right away, and up to MAX_NEW_CELLS new searches.
 * Resolves { places, failed } (failed = a search errored, e.g. over quota). Duplicates across cells removed.
 */
export async function placesForView(bounds, center) {
  restore();
  const wanted = byDistanceTo(center, cellsFor(bounds));
  let fresh = 0;
  for (const cell of wanted) {
    if (cells.has(cell.key) || fresh >= MAX_NEW_CELLS) continue;
    fresh += 1;
    cells.set(cell.key, searchCell(cell.center).catch(error => { cells.delete(cell.key); throw error; }));
  }
  let failed = false;
  const lists = await Promise.all(wanted.filter(cell => cells.has(cell.key)).map(cell => cells.get(cell.key).catch(() => { failed = true; return []; })));
  if (fresh) persist();
  const seen = new Set();
  const places = byProminence(lists.flat().filter(place => !seen.has(place.placeId) && seen.add(place.placeId)));
  return { places, failed, parkNamesFailed: parkSearchFailed };
}

// Google files some organizations and intersections under parks ("National Parks & Conservation", "Beacon St @ Park St").
// Some things Google types as "park" are objects in a park (benches, statues, carousels) rather than parks.
const NOT_A_PARK = /[&@]|conservanc|conservation|reservations|district|association|council|department|foundation|friends of|\b(bench|statue|placard|plaque|carousel|sculpture|fountains?|bust|sonar|marker|bathrooms?|restrooms?|dock|partners|parking)\b|memorial$|[\u3400-\u9fff]/i; // (the last: e.g. a luggage storage listed as a park)
// Real parks by Google's primary type; lower = more important when names compete for space.
const PARK_TYPES = { park: 0, city_park: 0, national_park: 0, state_park: 0, garden: 1, botanical_garden: 1, plaza: 2, dog_park: 2, playground: 2 };
export const parkWeight = place => PARK_TYPES[place.type] ?? 1;

// Google files bus stops as transit stations too. Their type can't tell them apart (Park Street and South Station
// are plain "transit_station" as well), but their names can: bus stops are intersections, "Bennington St @ Marion St".
/** A T station, not a bus stop. */
export function isTStation(place) {
  return place.icon === "train" && !/\s@\s/.test(place.name);
}

/** A park, not a bench, statue or office that Google tagged with "park". */
export function isRealPark(place) {
  if (place.type) return place.type in PARK_TYPES && !NOT_A_PARK.test(place.name);
  return place.icon === "park" && !NOT_A_PARK.test(place.name);
}

/**
 * The park and T names to draw on top, most important first: T stations (one per name: Park Street has a stop per
 * line), then real parks that this zoom has reached by prominence.
 */
export function parkAndTNames(places, zoom) {
  const seen = new Set();
  const stations = places.filter(isTStation)
    .sort((a, b) => a.rank - b.rank)
    .filter(place => !seen.has(place.name) && seen.add(place.name));
  const parks = places.filter(place => isRealPark(place) && zoom >= minZoomFor(place))
    .sort((a, b) => parkWeight(a) - parkWeight(b) || a.rank - b.rank);
  return [...stations, ...parks];
}
