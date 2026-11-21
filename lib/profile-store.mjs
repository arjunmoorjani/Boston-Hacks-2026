const storageKey = "sidewalk-profile";

export function guestDisplayName(name) {
  return (typeof name === "string" && name.trim()) || "Guest";
}

export function emptyProfile() {
  return { name: "", completions: [], ranking: [], customWalks: [] };
}

export function loadProfile(userId) {
  try {
    const key = userId ? `${storageKey}:${userId}` : storageKey;
    return { ...emptyProfile(), ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile, userId) {
  try {
    const key = userId ? `${storageKey}:${userId}` : storageKey;
    localStorage.setItem(key, JSON.stringify(profile));
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
    tLines: walk.tLines ?? [],
    path: walk.path,
    stops: walk.stops.length,
    miles: Number(stats.miles),
    minutes: Number(stats.minutes),
    completedAt: date.toISOString(),
  };
}

export function sampleActivity(walks, statsFor) {
  return {
    completions: walks.slice(0, 3).map((walk, index) =>
      completionFor(walk, statsFor(walk), new Date(Date.now() - index * 86400000))),
  };
}
