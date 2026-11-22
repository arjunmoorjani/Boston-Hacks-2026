// City and neighborhood names drawn on the map in the app's font (Google's own are hidden in lib/map-style.mjs).
// Cities show zoomed out, neighborhoods from neighborhood zoom in. Points are roughly each area's middle.

export const CITY_MAX_ZOOM = 12;   // cities at this zoom and wider
export const HOOD_MIN_ZOOM = 13;   // neighborhoods from here in

export const CITIES = [
  ["Boston", 42.3555, -71.0590], ["Cambridge", 42.3736, -71.1097], ["Somerville", 42.3876, -71.0995],
  ["Brookline", 42.3318, -71.1212], ["Chelsea", 42.3918, -71.0328], ["Everett", 42.4084, -71.0537],
  ["Medford", 42.4184, -71.1062], ["Malden", 42.4251, -71.0662], ["Revere", 42.4084, -71.0120],
  ["Watertown", 42.3709, -71.1828], ["Newton", 42.3370, -71.2092], ["Quincy", 42.2529, -71.0023],
].map(([name, lat, lng]) => ({ name, point: [lat, lng] }));

export const NEIGHBORHOODS = [
  ["North End", 42.3647, -71.0542], ["West End", 42.3641, -71.0661], ["Beacon Hill", 42.3588, -71.0707],
  ["Back Bay", 42.3503, -71.0810], ["South End", 42.3388, -71.0765], ["Downtown", 42.3555, -71.0605],
  ["Chinatown", 42.3496, -71.0621], ["Bay Village", 42.3486, -71.0684], ["Seaport", 42.3505, -71.0440],
  ["South Boston", 42.3334, -71.0495], ["Charlestown", 42.3782, -71.0602], ["East Boston", 42.3702, -71.0389],
  ["Fenway", 42.3429, -71.1003], ["Longwood", 42.3376, -71.1043], ["Mission Hill", 42.3330, -71.1032],
  ["Jamaica Plain", 42.3097, -71.1151], ["Roxbury", 42.3152, -71.0914], ["Dorchester", 42.3016, -71.0676],
  ["Allston", 42.3539, -71.1337], ["Brighton", 42.3464, -71.1627],
  ["Kendall Square", 42.3629, -71.0901], ["Central Square", 42.3654, -71.1037], ["Harvard Square", 42.3736, -71.1190],
  ["Inman Square", 42.3738, -71.1009], ["Davis Square", 42.3967, -71.1226], ["Union Square", 42.3794, -71.0937],
  ["Assembly Row", 42.3923, -71.0773], ["Coolidge Corner", 42.3420, -71.1215],
].map(([name, lat, lng]) => ({ name, point: [lat, lng] }));

/** Which labels a zoom level shows: "city", "hood", or both around the switch-over. */
export function areaLevel(zoom) {
  return { city: zoom <= CITY_MAX_ZOOM, hood: zoom >= HOOD_MIN_ZOOM };
}
