// Builds the inputs for lib/suggest.mjs from the walks already loaded (no network):
// places = every stop with a Google place id; transitions = "A, then B" pairs from the walks.
// There's no completion data yet, so popularity = how many walks include a place.

export function buildSuggestData(walks) {
  const places = new Map();
  const transitions = [];
  for (const walk of walks) {
    const stops = walk.stops.filter(stop => stop.placeId);
    stops.forEach((stop, index) => {
      const place = places.get(stop.placeId) ?? {
        placeId: stop.placeId, name: stop.name, lat: stop.point[0], lng: stop.point[1],
        primaryType: stop.primaryType ?? null, priceLevel: stop.priceLevel ?? null, hours: stop.hours ?? null,
        popularity: 0, note: stop.note, address: stop.address,
      };
      place.popularity += 1;
      places.set(stop.placeId, place);
      if (index > 0) transitions.push({ from: stops[index - 1].placeId, to: stop.placeId, people: 1 });
    });
  }
  return { places: [...places.values()], transitions };
}
