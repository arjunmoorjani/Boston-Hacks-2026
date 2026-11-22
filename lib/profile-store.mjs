const storageKey = "sidewalk-profile";
const coordinateLabel = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;

const loggedRouteCategory = category => category === "Logged excursion" ? "Logged route" : category;

function normalizeStoredProfile(profile) {
  return {
    ...profile,
    completions: (profile.completions ?? []).map(completion => ({
      ...completion,
      category: loggedRouteCategory(completion.category),
    })),
    customWalks: (profile.customWalks ?? []).map(walk => ({
      ...walk,
      category: loggedRouteCategory(walk.category),
      description: walk.description === "A previous excursion you logged." ? "A previous route you logged." : walk.description,
      stops: (walk.stops ?? []).map(stop => ({
        ...stop,
        name: !stop.placeId && coordinateLabel.test(stop.name ?? "") ? "Dropped pin" : stop.name,
        note: stop.note === "Excursion starting point." ? "Route starting point."
          : stop.note === "A stop on this excursion." ? "A stop on this route." : stop.note,
      })),
    })),
  };
}

export function guestDisplayName(name) {
  return (typeof name === "string" && name.trim()) || "Guest";
}

export function hasStoredProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(storageKey));
    return Boolean(profile && typeof profile === "object" && !Array.isArray(profile));
  } catch {
    return false;
  }
}

export function emptyProfile() {
  return { name: "You", completions: [], ranking: [], customWalks: [], favorites: [] }; // favorites: walk ids, newest first
}

export function loadProfile() {
  try {
    return normalizeStoredProfile({ ...emptyProfile(), ...JSON.parse(localStorage.getItem(storageKey)) });
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
}

export function completionFor(walk, stats, date = new Date()) {
  return {
    id: crypto.randomUUID(),
    walkId: walk.id,
    title: walk.title,
    area: walk.area,
    category: walk.category,
    tStation: walk.tStation ?? null,
    tLines: walk.tLines ?? [],
    path: walk.path,
    stops: walk.stops.length,
    miles: Number(stats.miles),
    minutes: Number(stats.minutes),
    completedAt: date.toISOString(),
    priceCategory: walk.priceCategory,
    peopleWith: walk.peopleWith,
    comments: walk.comments,
    photoPaths: walk.photoPaths,
    activityId: walk.activityId,
  };
}

export function sampleActivity(walks, statsFor) {
  return {
    completions: walks.slice(0, 3).map((walk, index) =>
      completionFor(walk, statsFor(walk), new Date(Date.now() - index * 86400000))),
  };
}

/** Heart or un-heart a walk: returns the new favorites list (newest first). */
export function toggleFavorite(favorites = [], walkId) {
  return favorites.includes(walkId) ? favorites.filter(id => id !== walkId) : [walkId, ...favorites];
}
