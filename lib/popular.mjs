// Which walks count as "popular" (they glow on the map).
// There's no shared usage data yet, so this stands in for it: a walk scores for every stop that other walks
// also go to (Boston's go-to places), plus the times you've finished it in this browser. Swap the score for
// real completion counts once they're stored in Supabase.

export const POPULAR_COUNT = 6;

export function popularWalkIds(walks, completions = [], count = POPULAR_COUNT) {
  const placeWalks = new Map();
  for (const walk of walks) {
    for (const placeId of new Set(walk.stops.map(stop => stop.placeId).filter(Boolean))) {
      placeWalks.set(placeId, (placeWalks.get(placeId) ?? 0) + 1);
    }
  }
  const finished = new Map();
  for (const completion of completions) finished.set(completion.walkId, (finished.get(completion.walkId) ?? 0) + 1);

  const scored = walks.map(walk => {
    const shared = walk.stops.reduce((sum, stop) => sum + Math.max(0, (placeWalks.get(stop.placeId) ?? 1) - 1), 0);
    return { id: walk.id, score: shared + 2 * (finished.get(walk.id) ?? 0) };
  }).filter(item => item.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return new Set(scored.slice(0, count).map(item => item.id));
}
