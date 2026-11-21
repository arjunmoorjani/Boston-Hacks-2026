export function walkMinutes(lat, lng, nextLat, nextLng) {
  const radians = Math.PI / 180;
  const north = (nextLat - lat) * 111.32;
  const east = (nextLng - lng) * 111.32 * Math.cos((lat + nextLat) / 2 * radians);
  return Math.max(1, Math.round(Math.hypot(north, east) / 4.8 * 60));
}

function nearby(point, places, maxWalkMin) {
  return places
    .map(stop => ({ stop, minutes: walkMinutes(...point, ...stop.point) }))
    .filter(({ minutes }) => minutes <= maxWalkMin)
    .sort((a, b) => a.minutes - b.minutes);
}

export function suggestRoutes(point, exclude, places, maxWalkMin = 15) {
  const candidates = places.filter(stop => !exclude.includes(stop.placeId));
  return nearby(point, candidates, maxWalkMin).flatMap(first => {
    const next = nearby(first.stop.point, candidates.filter(stop => stop !== first.stop),
      maxWalkMin - first.minutes)[0];
    if (!next) return [];
    return [{ stops: [first.stop, next.stop], walkMin: first.minutes + next.minutes }];
  }).slice(0, 3);
}
