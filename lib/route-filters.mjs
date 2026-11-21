// Route filters: one set of rules for the walk list and the map.
// Within a group any option can match ("Date" or "Solo"); across groups all must match (Food and Free).

export const CATEGORIES = ["Food", "Culture", "Nature", "Waterfront", "Shopping", "City"];

export const FILTER_GROUPS = [
  { id: "line", label: "T line", options: ["Red", "Orange", "Green", "Blue", "Silver"] },
  { id: "with", label: "Good for", options: ["Date", "With friends", "Solo", "Visiting family", "Study break", "First week in Boston"] },
  { id: "when", label: "When", options: ["Evening", "Late night", "Rainy day", "Sunday", "Winter"] },
  { id: "cost", label: "Cost", options: ["free", "$", "$$"], labels: { free: "Free", $: "$", $$: "$$" } },
  { id: "time", label: "Time", options: ["short", "medium", "long"], labels: { short: "Under 1½ h", medium: "1½–2½ h", long: "Over 2½ h" } },
];

export const emptyFilters = Object.freeze({ query: "", categories: [], line: [], with: [], when: [], cost: [], time: [] });

const lineFamily = id => id?.split("-")[0];
const timeBucket = min => !Number.isFinite(min) ? null : min < 90 ? "short" : min <= 150 ? "medium" : "long";
const norm = text => String(text ?? "").toLowerCase();

export function matchesQuery(walk, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const haystack = [walk.title, walk.area, walk.category, walk.tStation, ...(walk.tags ?? []), ...walk.stops.map(stop => stop.name)]
    .map(norm).join(" ");
  return q.split(/\s+/).every(word => haystack.includes(word));
}

/** True if the walk passes every active filter. */
export function matchesFilters(walk, filters, { skip } = {}) {
  const f = { ...emptyFilters, ...filters };
  const has = (group, test) => skip === group || !f[group].length || f[group].some(test);
  return matchesQuery(walk, f.query)
    && has("categories", category => walk.category === category)
    && has("line", line => (walk.tLines ?? []).some(id => lineFamily(id) === line))
    && has("with", tag => (walk.tags ?? []).includes(tag))
    && has("when", tag => (walk.tags ?? []).includes(tag))
    && has("cost", cost => walk.cost === cost)
    && has("time", bucket => timeBucket(walk.durationMin) === bucket);
}

export function applyFilters(walks, filters) {
  return walks.filter(walk => matchesFilters(walk, filters));
}

/** Walks per category given every other active filter, so the category chips show honest counts. */
export function categoryCounts(walks, filters) {
  const counts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  for (const walk of walks) if (matchesFilters(walk, filters, { skip: "categories" }) && walk.category in counts) counts[walk.category] += 1;
  return counts;
}

export function toggleOption(filters, group, option) {
  const current = filters[group] ?? [];
  return { ...filters, [group]: current.includes(option) ? current.filter(value => value !== option) : [...current, option] };
}

/** The active panel filters as removable chips (search and categories have their own controls). */
export function activeChips(filters) {
  return FILTER_GROUPS.flatMap(group => (filters[group.id] ?? []).map(value => ({ group: group.id, value, label: group.labels?.[value] ?? value })));
}

export const panelCount = filters => activeChips(filters).length;
export const anyActive = filters => Boolean(norm(filters.query).trim()) || filters.categories.length > 0 || panelCount(filters) > 0;
