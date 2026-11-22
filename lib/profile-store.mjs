const storageKey = "routable-profile";
const coordinateLabel = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;

function hideRawCoordinates(profile) {
  return {
    ...profile,
    customWalks: (profile.customWalks ?? []).map(walk => ({
      ...walk,
      stops: (walk.stops ?? []).map(stop => !stop.placeId && coordinateLabel.test(stop.name ?? "")
        ? { ...stop, name: "Dropped pin" }
        : stop),
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
    return hideRawCoordinates({ ...emptyProfile(), ...JSON.parse(localStorage.getItem(storageKey)) });
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
