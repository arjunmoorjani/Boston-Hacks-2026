export function buildSuggestData(walks) {
  const places = new Map();
  for (const walk of walks) {
    for (const stop of walk.stops) {
      if (stop.placeId) places.set(stop.placeId, stop);
    }
  }
  return [...places.values()];
}
