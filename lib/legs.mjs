// Legs of a walk (stop to stop), how you travel each one, and the turn-by-turn steps for following
// a leg while you're out. Routes come from lib/directions.mjs, fetched only when a leg needs them.

import { distanceM, walkMinutes } from "./suggest.mjs";

export const LEG_MODES = ["WALKING", "BICYCLING", "TRANSIT"];
export const LONG_WALK_M = 1600;   // about a mile in a straight line: suggest the T
export const ARRIVE_M = 25;        // this close to the end of a step counts as done
export const LIVE_MS = 2 * 60_000; // transit times go stale

const meters = (a, b) => distanceM(a[0], a[1], b[0], b[1]);

export const legKey = (from, to, mode) => `${from.point.join(",")}>${to.point.join(",")}|${mode}`;

/** One entry per gap between stops, with a walking estimate that needs no Google call. */
export function legsOf(walk) {
  return (walk?.stops ?? []).slice(1).map((to, i) => {
    const from = walk.stops[i];
    return { index: i, from, to, straightMeters: meters(from.point, to.point), estimateMin: walkMinutes(from.point[0], from.point[1], to.point[0], to.point[1]) };
  });
}

/** A fetched leg is reusable unless it's a transit leg old enough that its departure times are stale. */
export function legFresh(entry, mode, now = Date.now()) {
  if (!entry || entry.status === "error") return false;
  if (entry.status === "loading") return true;
  return mode !== "TRANSIT" || now - entry.at < LIVE_MS;
}

/** Minutes for a leg in a mode: the fetched route when there is one, else the walking estimate (null if unknown). */
export function legMinutes(leg, mode, entry) {
  if (entry?.status === "ready") return entry.result.minutes;
  return mode === "WALKING" ? leg.estimateMin : null;
}

/** Time spent getting between stops, and whether every leg's time is known yet. */
export function travelTotal(legs, modeOf, entryOf) {
  let minutes = 0, known = true;
  for (const leg of legs) {
    const mode = modeOf(leg.index);
    const value = legMinutes(leg, mode, entryOf(leg, mode));
    if (value == null) known = false;
    else minutes += value;
  }
  return { minutes: Math.round(minutes), known };
}

/** Cut a walk's path into one piece per leg, at the path points nearest each stop. Falls back to straight lines. */
export function splitPathAtStops(path, stops) {
  if (!path?.length || path.length < 2 || stops.length < 2) return stops.slice(1).map((stop, i) => [stops[i].point, stop.point]);
  const cuts = [];
  let from = 0;
  for (const stop of stops) {
    let best = from, bestD = Infinity;
    for (let i = from; i < path.length; i++) {
      const d = meters(path[i], stop.point);
      if (d < bestD) { bestD = d; best = i; }
    }
    cuts.push(best);
    from = best;
  }
  return cuts.slice(1).map((end, i) => {
    const piece = path.slice(cuts[i], end + 1);
    return piece.length >= 2 ? piece : [stops[i].point, stops[i + 1].point];
  });
}

/** Flatten a directions result into the steps you follow one at a time. Rides are a single step. */
export function navSteps(result, destinationName) {
  if (!result) return [];
  const steps = [];
  for (const segment of result.segments) {
    if (segment.kind === "transit") {
      const end = segment.path.at(-1) ?? null;
      steps.push({ kind: "board", maneuver: "TRANSIT", instruction: `Take the ${segment.line.name}${segment.headsign ? ` toward ${segment.headsign}` : ""}`,
        note: `${segment.from ? `From ${segment.from}. ` : ""}${segment.stops != null ? `${segment.stops} ${segment.stops === 1 ? "stop" : "stops"}, ` : ""}get off at ${segment.to}`,
        meters: segment.meters, path: segment.path, end, line: segment.line, departAt: segment.departAt });
      continue;
    }
    for (const step of segment.steps) {
      steps.push({ kind: segment.kind, maneuver: step.maneuver ?? null, instruction: step.instruction, note: step.note, meters: step.meters, path: step.path ?? [], end: step.end ?? null });
    }
  }
  steps.push({ kind: "arrive", maneuver: "ARRIVE", instruction: `Arrive at ${destinationName}`, note: null, meters: 0, path: [], end: null });
  return steps;
}

/** Which arrow to show for a step: Google's maneuver when it gave one, else read the instruction text. */
export function maneuverIcon(step) {
  const m = step?.maneuver ?? "";
  const text = (step?.instruction ?? "").toLowerCase();
  if (m === "ARRIVE") return "arrive";
  if (m === "TRANSIT") return "train";
  if (/UTURN/.test(m) || text.includes("u-turn")) return "uturn";
  const right = /RIGHT/.test(m) || (!m && text.includes("right"));
  const left = /LEFT/.test(m) || (!m && text.includes("left"));
  const slight = /SLIGHT|KEEP|RAMP|FORK|MERGE/.test(m) || text.includes("slight") || text.includes("keep");
  if (left) return slight ? "slightLeft" : "turnLeft";
  if (right) return slight ? "slightRight" : "turnRight";
  return "straight";
}

/**
 * Follow your position through the steps: skip past every step whose end you've reached, and say how far
 * the current step's end is. Without a location, the step stays where it is.
 */
export function followSteps(steps, index, location) {
  if (!location || !steps.length) return { index, metersLeft: null };
  let i = index;
  while (i < steps.length - 1 && steps[i].end && meters(location, steps[i].end) <= ARRIVE_M) i++;
  const end = steps[i]?.end;
  return { index: i, metersLeft: end ? meters(location, end) : null };
}
