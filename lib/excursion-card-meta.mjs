import { CITIES, NEIGHBORHOODS } from "./area-labels.mjs";

const AREA_ALIASES = Object.freeze({
  "Coolidge Corner": "Brookline",
  "Kendall Square": "Cambridge",
  "Central Square": "Cambridge",
  "Harvard Square": "Cambridge",
  "Inman Square": "Cambridge",
  "Davis Square": "Somerville",
  "Union Square": "Somerville",
  "Assembly Row": "Somerville",
});

function distanceSquared(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Number.POSITIVE_INFINITY;
  const lat = Number(a[0]);
  const lng = Number(a[1]);
  if (![lat, lng, Number(b[0]), Number(b[1])].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  // One degree of longitude is shorter than one degree of latitude in Boston.
  return (lat - Number(b[0])) ** 2 + ((lng - Number(b[1])) * 0.74) ** 2;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A human-friendly neighborhood or nearby city for a custom excursion's first stop. */
export function nearestArea(point) {
  const candidates = [...NEIGHBORHOODS, ...CITIES];
  const nearest = candidates.reduce((best, area) =>
    distanceSquared(point, area.point) < distanceSquared(point, best?.point) ? area : best, null);
  return AREA_ALIASES[nearest?.name] ?? nearest?.name ?? "Boston";
}

/**
 * Build one representative point per curated T station. The median makes this robust to a malformed route and
 * lets custom excursions use the same station names and line chips as the premade catalog.
 */
export function stationCandidates(catalogWalks) {
  const grouped = new Map();
  for (const walk of catalogWalks ?? []) {
    const point = walk.stops?.[0]?.point;
    if (!walk.tStation || distanceSquared(point, point) !== 0) continue;
    const station = grouped.get(walk.tStation) ?? { name: walk.tStation, points: [], lines: new Set() };
    station.points.push(point);
    for (const line of walk.tLines ?? []) station.lines.add(line);
    grouped.set(walk.tStation, station);
  }
  return [...grouped.values()].map(station => ({
    name: station.name,
    point: [median(station.points.map(point => Number(point[0]))), median(station.points.map(point => Number(point[1])))],
    lines: [...station.lines],
  }));
}

export function nearestStation(point, catalogWalks) {
  return stationCandidates(catalogWalks).reduce((best, station) =>
    distanceSquared(point, station.point) < distanceSquared(point, best?.point) ? station : best, null);
}

/** Fill missing transit metadata for old activities and catalog entries without changing an existing curated stop. */
export function withNearestTStop(walk, catalogWalks) {
  if (!walk || walk.tStation) return walk;
  const station = nearestStation(walk.stops?.[0]?.point, catalogWalks);
  if (!station) return walk;
  return { ...walk, tStation: station.name, tLines: station.lines };
}

/** Add the card fields logged excursions do not receive from the route-building response. */
export function withExcursionCardMeta(walk, catalogWalks) {
  if (!walk || (!["Logged route", "Logged excursion"].includes(walk.category) && !String(walk.id).startsWith("logged:"))) return walk;
  const firstPoint = walk.stops?.[0]?.point;
  const station = nearestStation(firstPoint, catalogWalks);
  return {
    ...walk,
    area: nearestArea(firstPoint),
    durationMin: Number.isFinite(walk.durationMin) ? walk.durationMin
      : Number.isFinite(walk.minutes) ? Math.max(1, Math.round(walk.minutes)) : null,
    tStation: station?.name ?? null,
    tLines: station?.lines ?? [],
  };
}
