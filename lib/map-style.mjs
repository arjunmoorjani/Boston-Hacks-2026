// The map's look: a monochrome Google base map, blue routes and navy numbered stops.
// Google only applies `styles` to maps created without a mapId, so the map has none (see app/google-boston-map.jsx).

export const MONO_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#F4F4F2" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#1A1A1A" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#F4F4F2" }, { weight: 3 }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#F4F4F2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D9D9D6" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5E5E5A" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#E2E3DD" }] },
  { featureType: "poi.park", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4A4A46" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "on" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#222222" }, { weight: 0.4 }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#5E5E5A" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#EBEBE8" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#D2D2CE" }, { weight: 0.5 }] },
  { featureType: "road.highway", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station.rail", stylers: [{ visibility: "on" }] },
  { featureType: "transit.station.bus", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.stroke", stylers: [{ color: "#F4F4F2" }, { weight: 4 }] },
];

// City and neighborhood names are drawn by us in the app's font (app/google-boston-map.jsx), so Google's are off.
// Street names (and highway shields) are off too: the map shows only our labels.
const OUR_AREA_LABELS = [
  { featureType: "administrative.locality", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  // water and natural-feature names (Charles River, Shawmut Peninsula) are ours too, so they sit on top of routes
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.natural", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/** Added from zoom 15: park and T station names are ours there (drawn on top of routes and markers), so Google's are off. */
export const HIDE_GOOGLE_PARK_T_NAMES = [
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/** Exploring: Google's place icons are off; our own markers (lib/nearby-places.mjs) take their place. */
export const EXPLORE_STYLE = [
  ...MONO_STYLE,
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  ...OUR_AREA_LABELS,
];

/** Exploring when our markers can't load (e.g. Nearby Search over its quota): Google's own place icons instead. */
export const EXPLORE_GOOGLE_ICONS_STYLE = [
  ...MONO_STYLE.filter(rule =>
    !(rule.featureType === "poi" && !rule.elementType)                                // "all places off"
    && !(rule.featureType === "poi.park" && rule.elementType === "labels.icon")),     // park icons off
  ...OUR_AREA_LABELS,
];

/** With a walk open or a place selected, Google's own icons (attractions, T stations, highway shields) are hidden. */
export const WALK_OPEN_STYLE = [
  ...MONO_STYLE,
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  ...OUR_AREA_LABELS,
];

/** Route and stop colors, shared by the map and (as CSS variables in app/styles.css) the rest of the UI. */
export const ROUTE_THEME = Object.freeze({
  line: "#4A90E2",
  casing: "#FFFFFF",
  glow: "#7DB4F0",   // the halo around popular routes
  favorite: "#E8559A", // walks you've hearted
  stop: "#1B2A4A",
  stopRing: "#4A90E2",
  lineWeight: 4,
  casingWeight: 7,
  dimOpacity: 0.35,  // routes other than the selected one
  draftOpacity: 0.7, // the editor's straight-line preview
});

export const STOP_SIZE = 22;          // a numbered stop
export const STOP_SIZE_SELECTED = 28;
export const ICON_STOP_SIZE = 26;     // a stop showing its category icon (a little bigger so the icon reads)
export const ICON_STOP_SIZE_SELECTED = 32;

// ---------- category icons: Google place type -> icon ----------
// Line icons on a 24-unit grid, drawn white inside the stop circle.
export const ICON_PATHS = {
  restaurant: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.7 1-3 3.2-3 6v3h3v9M17 3v18",
  cafe: "M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8zM16 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2",
  bakery: "M4 21h16M5 21v-7h14v7M5 14c2 1.5 4.5 1.5 7 0s5-1.5 7 0M12 14V10M12 7.5a1.3 1.3 0 0 1-1.3-1.3C10.7 5 12 4 12 4s1.3 1 1.3 2.2A1.3 1.3 0 0 1 12 7.5z",
  bar: "M6 6h9v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6zM15 9h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 10h9",
  park: "M12 22v-6M12 2l6 9h-3l4 5H5l4-5H6z",
  museum: "M3 10h18M12 3 3 8h18zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
  books: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM19 19v2H6",
  shopping: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  bridge: "M2 16h20M4 16v4M20 16v4M2 10c4 0 6 6 10 6s6-6 10-6M7 13.5V16M17 13.5V16",
  aquarium: "M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3zM8 11.5v.01",
  church: "M12 2v4M10 4h4M7 21V11l5-4 5 4v10M3 21h18M10 21v-4h4v4",
  venue: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
  landmark: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z",
  hotel: "M3 18V6M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3M7 10.5v.01",
  train: "M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 10h16M8 21l2-3M16 21l-2-3M8 14h.01M16 14h.01",
  street: "M12 3v18M5 5h11l3 2.5L16 10H5zM19 12H8l-3 2.5L8 17h11z",
  water: "M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2",
  place: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zM12 11h.01",
};

const TYPE_ICON = [
  [/subway_station|light_rail_station|train_station|transit_station/, "train"],
  [/bakery|pastry|dessert|donut|cake|ice_cream|chocolate|confection/, "bakery"],
  [/cafe|coffee|tea_house/, "cafe"],
  [/bar$|^bar_|pub|brewery|winery|wine_bar|night_club/, "bar"],
  [/restaurant|food|diner|meal|pizza|sandwich|steak|sushi|ramen|bistro/, "restaurant"],
  [/park|garden|natural_feature|cemetery|hiking|beach|playground|dog_park|nature/, "park"],
  [/museum|gallery|art_studio/, "museum"],
  [/book|library/, "books"],
  [/market|store|shop|mall|boutique/, "shopping"],
  [/bridge/, "bridge"],
  [/aquarium|zoo/, "aquarium"],
  [/church|place_of_worship|mosque|synagogue|temple/, "church"],
  [/stadium|arena|venue|amphitheat|theater|theatre|concert|cinema|sports/, "venue"],
  [/attraction|landmark|monument|historical|tourist|plaza|observation/, "landmark"],
  [/hotel|lodging|inn|hostel/, "hotel"],
  [/government|city_hall|courthouse|capitol/, "landmark"],
  [/^route$|street_address/, "street"],
];

// Types too vague to trust (Google calls Piers Park a "sports_school"): fall back to the stop's name.
const VAGUE_TYPES = /^(intersection|premise|point_of_interest|establishment|sports_school|association_or_organization)$/;

// For stops Google gave no type: read the name ("Newbury Street", "South End dinner", "Charles River Esplanade").
const NAME_ICON = [
  [/dinner|lunch|food|pizza|taqueria|roast beef|restaurant|brunch/, "restaurant"],
  [/coffee|caf[eé]/, "cafe"],
  [/bakery|pastry|cannoli/, "bakery"],
  [/brewery|beer|\bbar\b/, "bar"],
  [/galler|guild|museum|\bart\b/, "museum"],
  [/book/, "books"],
  [/theat|cinema|rink|skate|stadium/, "venue"],
  [/market|flea|shop/, "shopping"],
  [/park|garden|esplanade|path|common|arboretum|\btrees?\b|\bhill\b/, "park"],
  [/wharf|harbor|pier|beach|riverbank|waterfront|pond|lake/, "water"],
  [/street|\bst\b|avenue|\bave\b|road|\brd\b|boulevard|lane|square|\brow\b/, "street"],
  [/state house|hall|monument|memorial|church|side$/, "landmark"],
];

/**
 * Which icon a stop gets: from its Google primaryType ("italian_restaurant" -> "restaurant"), else from its
 * name ("Newbury Street" -> "street"), else a plain place pin. Every stop gets one.
 */
export function placeIconFor(primaryType, name = "") {
  const type = String(primaryType ?? "").toLowerCase();
  if (type && !VAGUE_TYPES.test(type)) {
    const byType = TYPE_ICON.find(([pattern]) => pattern.test(type))?.[1];
    if (byType) return byType;
  }
  const text = String(name ?? "").toLowerCase();
  return NAME_ICON.find(([pattern]) => pattern.test(text))?.[1] ?? "place";
}

const iconCache = new Map();
const FONT = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

/**
 * A stop marker as an SVG image: a navy circle with a blue ring holding the category icon (with a small blue
 * number badge so the order still shows) or just the number when the place has no category. A finished stop
 * on a walk is blue with a white check. On a favorite walk the blue parts are pink. Returns { url, width, height, anchor: [x, y] } with the anchor at the
 * circle's center. Cached.
 */
export function stopMarker(number, { icon = null, selected = false, done = false, favorite = false } = {}) {
  const key = `${number}|${icon}|${selected}|${done}|${favorite}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const { stop } = ROUTE_THEME;
  // a favorite walk's stops take its pink: ring, number badge and the finished-stop fill
  const line = favorite ? ROUTE_THEME.favorite : ROUTE_THEME.line;
  const stopRing = favorite ? ROUTE_THEME.favorite : ROUTE_THEME.stopRing;
  const showIcon = Boolean(icon && ICON_PATHS[icon]) && !done;
  const size = showIcon ? (selected ? ICON_STOP_SIZE_SELECTED : ICON_STOP_SIZE) : (selected ? STOP_SIZE_SELECTED : STOP_SIZE);
  const badge = showIcon ? 7 : 0;   // badge radius; the canvas grows up and right to make room
  const width = size + badge, height = size + badge;
  const cx = size / 2, cy = badge + size / 2, r = size / 2;
  let mark;
  if (done) {
    mark = `<path d="M${cx - size * 0.2} ${cy + size * 0.02} l${size * 0.13} ${size * 0.13} l${size * 0.27} -${size * 0.28}" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (showIcon) {
    const g = size * 0.54, scale = g / 24;
    mark = `<g transform="translate(${cx - g / 2} ${cy - g / 2}) scale(${scale})" fill="none" stroke="#FFFFFF" stroke-width="${(1.7 / scale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[icon]}"/></g>`
      + `<circle cx="${width - badge}" cy="${badge}" r="${badge - 0.5}" fill="${line}" stroke="#FFFFFF" stroke-width="1.5"/>`
      + `<text x="${width - badge}" y="${badge}" dy=".35em" text-anchor="middle" font-family="${FONT}" font-size="8.5" font-weight="700" fill="#FFFFFF">${number}</text>`;
  } else {
    mark = `<text x="${cx}" y="${cy}" dy=".36em" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="500" fill="#FFFFFF">${number}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<circle cx="${cx}" cy="${cy}" r="${r - 1.25}" fill="${done ? line : stop}" stroke="${stopRing}" stroke-width="2.5"/>${mark}</svg>`;
  const marker = { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height, anchor: [cx, cy] };
  iconCache.set(key, marker);
  return marker;
}
