// In-app directions (walking, biking, transit or driving) from Google's Routes API, shaped for the directions view:
// a summary plus segments like Google Maps shows them: "Walk 6 min to Park Street", then
// "Green Line B toward Government Center · 9 stops". Each segment carries its own map path.

import { loadGoogleMaps, mapPoint } from "./google-maps.mjs";

export const MODES = ["WALKING", "BICYCLING", "TRANSIT", "DRIVING"];
const NO_ROUTE = { WALKING: "No walking route found.", BICYCLING: "No bike route found. Try walking or transit.", TRANSIT: "No transit route found. Try walking.", DRIVING: "No driving route found." };
const LIVE = new Set(["TRANSIT", "DRIVING"]); // depend on the time you leave (schedules, traffic)
const STEP_KIND = { BICYCLING: "bike", DRIVING: "drive" };
const FIELDS = ["path", "distanceMeters", "durationMillis", "legs", "localizedValues", "warnings"];
const TRANSIT_TTL_MS = 2 * 60_000; // departure times and traffic go stale; walking and bike routes don't

const cache = new Map();

/** origin/destination are [lat, lng]. Cached briefly so switching modes back and forth is free. */
export async function fetchDirections(origin, destination, mode, now = new Date()) {
  const key = [origin, destination].map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(">") + `|${mode}`;
  const hit = cache.get(key);
  if (hit && (!LIVE.has(mode) || now - hit.at < TRANSIT_TTL_MS)) return hit.result;

  const maps = await loadGoogleMaps();
  const { Route } = await maps.importLibrary("routes");
  const { routes } = await Route.computeRoutes({
    origin: mapPoint(origin), destination: mapPoint(destination), travelMode: mode,
    ...(mode === "TRANSIT" ? { departureTime: now } : {}),
    ...(mode === "DRIVING" ? { routingPreference: "TRAFFIC_AWARE" } : {}), // travel time with today's traffic
    fields: FIELDS,
  });
  const result = normalizeDirections(routes?.[0], mode, now);
  cache.set(key, { at: now, result });
  return result;
}

const toPoint = p => [typeof p.lat === "function" ? p.lat() : p.lat, typeof p.lng === "function" ? p.lng() : p.lng];
const minutesOf = ms => (Number.isFinite(ms) ? ms / 60000 : 0);
const asDate = value => (value instanceof Date ? value : value ? new Date(value) : null);

/** Turn a Routes API route into { minutes, meters, fare, arriveAt, path, segments, warnings }. Throws if there's no route. */
export function normalizeDirections(route, mode, now = new Date()) {
  const steps = (route?.legs ?? []).flatMap(leg => leg.steps ?? []);
  if (!route || !Number.isFinite(route.durationMillis)) {
    throw new Error(NO_ROUTE[mode] ?? NO_ROUTE.WALKING);
  }

  const segments = [];
  for (const step of steps) {
    const path = (step.path ?? []).map(toPoint);
    const transit = step.transitDetails;
    if (step.travelMode === "TRANSIT" && transit) {
      const line = transit.transitLine ?? {};
      segments.push({
        kind: "transit",
        minutes: minutesOf(step.staticDurationMillis),
        meters: step.distanceMeters ?? 0,
        path,
        line: {
          name: line.name || line.shortName || "Transit",
          short: line.shortName || null,
          color: line.color || "#4B33C9",
          textColor: line.textColor || "#ffffff",
          vehicle: line.vehicle?.name || null,
        },
        headsign: transit.headsign || null,
        from: transit.departureStop?.name || null,
        to: transit.arrivalStop?.name || null,
        stops: transit.stopCount ?? null,
        departAt: asDate(transit.departureTime),
        arriveAt: asDate(transit.arrivalTime),
      });
      continue;
    }
    // consecutive walking, biking or driving steps become one "Walk N min" / "Bike N min" / "Drive N min" segment with its turn-by-turn instructions
    const kind = STEP_KIND[step.travelMode ?? mode] ?? "walk";
    let walk = segments.at(-1);
    if (walk?.kind !== kind) { walk = { kind, minutes: 0, meters: 0, path: [], steps: [] }; segments.push(walk); }
    walk.minutes += minutesOf(step.staticDurationMillis);
    walk.meters += step.distanceMeters ?? 0;
    walk.path.push(...path);
    if (step.instructions) walk.steps.push({ instruction: step.instructions.split("\n")[0], note: step.instructions.split("\n").slice(1).join(" ") || null, meters: step.distanceMeters ?? 0 });
  }
  // where each walk ends: the next ride's boarding stop, or the destination
  segments.forEach((segment, i) => {
    if (segment.kind !== "transit") segment.toStop = segments[i + 1]?.kind === "transit" ? segments[i + 1].from : null;
  });

  // Step times leave out traffic; with one drive/walk/bike segment, show the same time as the total.
  if (segments.length === 1 && segments[0].kind !== "transit") segments[0].minutes = minutesOf(route.durationMillis);

  const path = (route.path ?? []).map(toPoint);
  return {
    mode,
    minutes: minutesOf(route.durationMillis),
    meters: route.distanceMeters ?? 0,
    fare: route.localizedValues?.transitFare || null,
    arriveAt: new Date(now.getTime() + route.durationMillis),
    path: path.length ? path : segments.flatMap(segment => segment.path),
    segments,
    warnings: route.warnings ?? [],
  };
}

// ---------- labels ----------
export const minutesLabel = min => {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};
export const distanceLabel = meters => meters < 160 ? `${Math.round(meters * 3.281 / 10) * 10} ft` : `${(meters / 1609.344).toFixed(1)} mi`;
export const timeLabel = date => date ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(date) : "";
