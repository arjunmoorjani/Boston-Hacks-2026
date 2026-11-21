// GENERATED from the main project's lib/suggest.ts (bostonhacks repo) — do not edit here.
// Regenerate from that project folder:
//   node_modules/.bin/esbuild lib/suggest.ts --format=esm --target=es2022 --outfile=<this repo>/lib/suggest.mjs
const W = { transition: 0.35, distance: 0.3, popularity: 0.2, fit: 0.15 };
const WALK_M_PER_MIN = 80;
const DETOUR = 1.3;
const HERE_M = 150;
function suggestNext(ctx, places, transitions) {
  const clock = bostonClock(ctx.when ?? /* @__PURE__ */ new Date());
  const maxWalk = ctx.maxWalkMin ?? 20;
  const exclude = new Set(ctx.exclude ?? []);
  const byId = new Map(places.map((p) => [p.placeId, p]));
  const after = ctx.afterPlaceId && byId.get(ctx.afterPlaceId) || nearestWithin(places, ctx.lat, ctx.lng, HERE_M);
  if (after) exclude.add(after.placeId);
  const fromGroup = after ? groupOf(after.primaryType) : null;
  const wentNext = /* @__PURE__ */ new Map();
  if (after) {
    for (const t of transitions) if (t.from === after.placeId) wentNext.set(t.to, (wentNext.get(t.to) ?? 0) + t.people);
  }
  const maxT = Math.max(0, ...wentNext.values());
  const maxPop = Math.max(0, ...places.map((p) => p.popularity));
  const cands = [];
  for (const p of places) {
    if (exclude.has(p.placeId)) continue;
    const walk = walkMinutes(ctx.lat, ctx.lng, p.lat, p.lng);
    if (walk > maxWalk || !withinBudget(p.priceLevel, ctx.budget)) continue;
    const open = isOpenAt(p.hours, clock, walk);
    if (open === false) continue;
    const g = groupOf(p.primaryType);
    const people = wentNext.get(p.placeId) ?? 0;
    const T = maxT ? people / maxT : 0;
    const P = maxPop ? Math.log1p(p.popularity) / Math.log1p(maxPop) : 0;
    const D = Math.exp(-walk / 10);
    const pair = fromGroup ? PAIR[fromGroup][g] ?? 0.3 : 0.6;
    const fit = pair * timeFit(g, clock.hour) * (ctx.raining && g === "outdoors" ? 0.3 : 1);
    const score = W.transition * T + W.distance * D + W.popularity * P + W.fit * fit;
    const reasons = [];
    if (people > 0) reasons.push(`${people} people went here next`);
    reasons.push(`${walk} min walk`);
    if (open === true) reasons.push("Open now");
    if (ctx.raining && INDOOR.has(g)) reasons.push("Indoors");
    if (!people && P > 0.9) reasons.push("Popular stop");
    cands.push({ placeId: p.placeId, name: p.name, group: g, lat: p.lat, lng: p.lng, walkMin: walk, score: round(score), reasons: reasons.slice(0, 3) });
  }
  return pickDiverse(cands, ctx.limit ?? 3);
}
const VISIT_MIN = 45;
const BRANCH = 4;
const BEAM = 8;
function suggestRoutes(ctx, places, transitions, opts = {}) {
  const length = Math.min(4, Math.max(1, Math.round(opts.length ?? 3)));
  const want = Math.max(1, opts.routes ?? 3);
  const start = ctx.when ?? /* @__PURE__ */ new Date();
  const byId = new Map(places.map((p) => [p.placeId, p]));
  const startPlace = ctx.afterPlaceId && byId.get(ctx.afterPlaceId) || nearestWithin(places, ctx.lat, ctx.lng, HERE_M);
  const baseExclude = [...ctx.exclude ?? [], ...startPlace ? [startPlace.placeId] : []];
  let beam = [{ stops: [], walk: 0, total: 0 }];
  for (let step = 0; step < length; step++) {
    const next = [];
    for (const r of beam) {
      const last = r.stops[r.stops.length - 1];
      const elapsed = r.walk + r.stops.length * VISIT_MIN;
      const options = suggestNext({
        ...ctx,
        lat: last?.lat ?? ctx.lat,
        lng: last?.lng ?? ctx.lng,
        afterPlaceId: last?.placeId ?? startPlace?.placeId ?? null,
        exclude: [...baseExclude, ...r.stops.map((s) => s.placeId)],
        when: new Date(start.getTime() + elapsed * 6e4),
        limit: BRANCH
      }, places, transitions);
      for (const s of options) next.push({ stops: [...r.stops, s], walk: r.walk + s.walkMin, total: r.total + s.score });
    }
    if (!next.length) break;
    beam = next.sort((a, b) => b.total - a.total).slice(0, BEAM);
  }
  const done = beam.filter((r) => r.stops.length > 0).map((r) => ({
    stops: r.stops,
    walkMin: r.walk,
    durationMin: r.walk + r.stops.length * VISIT_MIN,
    score: round(r.total / length)
    // divide by the target length so cut-short routes rank lower
  }));
  return pickDistinctRoutes(done, want);
}
function pickDistinctRoutes(c, n) {
  const out = [];
  const left = [...c];
  while (out.length < n && left.length) {
    let bi = 0, bv = -Infinity;
    left.forEach((r, i) => {
      const ids = new Set(r.stops.map((s) => s.placeId));
      const overlap = Math.max(0, ...out.map((o) => (o.stops.filter((s) => ids.has(s.placeId)).length + (o.stops[0].placeId === r.stops[0].placeId ? 1 : 0)) / (r.stops.length + 1)));
      const v = r.score * (1 - 0.6 * overlap);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    const pick = left.splice(bi, 1)[0];
    if (out.some((o) => o.stops.map((s) => s.placeId).join() === pick.stops.map((s) => s.placeId).join())) continue;
    out.push(pick);
  }
  return out;
}
function suggestPlans(ctx, plans, limit = 2) {
  const clock = bostonClock(ctx.when ?? /* @__PURE__ */ new Date());
  const maxWalk = ctx.maxWalkMin ?? 20;
  const live = plans.filter((p) => p.stops.length > 0 && isLive(p, clock.date));
  if (!live.length) return [];
  const elos = live.map((p) => p.elo);
  const lo = Math.min(...elos), hi = Math.max(...elos);
  const out = [];
  for (const p of live) {
    let j = 0, best = Infinity;
    p.stops.forEach((s, i) => {
      const d = distanceM(ctx.lat, ctx.lng, s.lat, s.lng);
      if (d < best) {
        best = d;
        j = i;
      }
    });
    let reason, joinIdx = j, walk;
    if (best < HERE_M) {
      if (j === p.stops.length - 1) continue;
      joinIdx = j + 1;
      walk = walkMinutes(ctx.lat, ctx.lng, p.stops[joinIdx].lat, p.stops[joinIdx].lng);
      reason = `You're at ${p.stops[j].name}. Next up: ${p.stops[joinIdx].name}`;
    } else {
      if (j === p.stops.length - 1 && p.stops.length > 1) continue;
      walk = walkMinutes(ctx.lat, ctx.lng, p.stops[j].lat, p.stops[j].lng);
      reason = j === 0 ? `Starts ${walk} min away` : `Join at stop ${j + 1}, ${p.stops[j].name}, ${walk} min away`;
    }
    if (walk > maxWalk) continue;
    const quality = hi > lo ? (p.elo - lo) / (hi - lo) : 0.5;
    const score = 0.45 * Math.exp(-walk / 10) + 0.35 * quality + 0.2 * tagFit(p.tags, clock.hour, ctx.raining);
    out.push({ slug: p.slug, name: p.name, joinAt: joinIdx + 1, walkMin: walk, score: round(score), reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
const GROUP_RULES = [
  ["culture", (t) => t.endsWith("museum") || [
    "museum",
    "art_gallery",
    "library",
    "book_store",
    "historical_landmark",
    "historical_place",
    "cultural_landmark",
    "monument",
    "church",
    "performing_arts_theater",
    "tourist_attraction",
    "university"
  ].includes(t)],
  ["sweet", (t) => [
    "bakery",
    "pastry_shop",
    "dessert_shop",
    "dessert_restaurant",
    "ice_cream_shop",
    "donut_shop",
    "confectionery",
    "chocolate_shop",
    "candy_store",
    "cafe",
    "coffee_shop",
    "tea_house",
    "juice_shop",
    "bagel_shop"
  ].includes(t)],
  ["drink", (t) => ["bar", "pub", "brewery", "wine_bar", "night_club", "cocktail_bar", "brewpub", "bar_and_grill"].includes(t)],
  ["food", (t) => t.includes("restaurant") || ["sandwich_shop", "food_court", "meal_takeaway", "deli", "diner", "steak_house"].includes(t)],
  ["outdoors", (t) => [
    "park",
    "garden",
    "beach",
    "hiking_area",
    "national_park",
    "marina",
    "plaza",
    "botanical_garden",
    "cemetery",
    "city_park",
    "state_park",
    "observation_deck",
    "scenic_spot",
    "bridge",
    "lake",
    "natural_feature"
  ].includes(t)],
  ["activity", (t) => [
    "movie_theater",
    "ice_skating_rink",
    "bowling_alley",
    "amusement_center",
    "gym",
    "sports_complex",
    "stadium",
    "aquarium",
    "zoo",
    "climbing_gym",
    "event_venue",
    "video_arcade",
    "amusement_park",
    "amphitheatre",
    "sports_activity_location"
  ].includes(t)],
  ["shop", (t) => t.includes("store") || t.includes("market") || t.includes("shop") || t === "shopping_mall"]
];
function groupOf(primaryType) {
  if (!primaryType) return "other";
  return GROUP_RULES.find(([, test]) => test(primaryType))?.[0] ?? "other";
}
const INDOOR = /* @__PURE__ */ new Set(["culture", "sweet", "food", "drink", "shop", "activity"]);
const PAIR = {
  culture: { sweet: 1, food: 0.9, drink: 0.7, outdoors: 0.7, culture: 0.6, shop: 0.5, activity: 0.5 },
  food: { sweet: 1, outdoors: 0.8, drink: 0.8, activity: 0.7, culture: 0.5, shop: 0.4, food: 0.1 },
  sweet: { outdoors: 1, culture: 0.8, shop: 0.7, activity: 0.6, drink: 0.4, food: 0.3, sweet: 0.15 },
  drink: { food: 1, sweet: 0.8, activity: 0.6, outdoors: 0.5, drink: 0.3, culture: 0.2, shop: 0.2 },
  outdoors: { food: 1, sweet: 0.9, culture: 0.7, drink: 0.7, shop: 0.5, activity: 0.5, outdoors: 0.4 },
  shop: { sweet: 1, food: 0.9, outdoors: 0.6, culture: 0.6, drink: 0.5, shop: 0.4, activity: 0.4 },
  activity: { food: 1, sweet: 0.9, drink: 0.8, outdoors: 0.5, culture: 0.4, shop: 0.4, activity: 0.2 },
  other: {}
};
function timeFit(g, hour) {
  const late = { drink: 1, sweet: 0.9, food: 0.8, activity: 0.6, outdoors: 0.4, culture: 0.2, shop: 0.2, other: 0.5 };
  const evening = { food: 1, drink: 0.9, sweet: 0.8, activity: 0.8, outdoors: 0.6, culture: 0.6, shop: 0.5, other: 0.6 };
  const morning = { sweet: 1, outdoors: 0.9, food: 0.7, culture: 0.7, shop: 0.5, activity: 0.5, drink: 0.1, other: 0.6 };
  const day = { culture: 1, outdoors: 0.9, sweet: 0.9, shop: 0.9, food: 0.8, activity: 0.8, drink: 0.4, other: 0.6 };
  const t = hour >= 21 || hour < 4 ? late : hour >= 17 ? evening : hour < 11 ? morning : day;
  return t[g];
}
function tagFit(tags, hour, raining) {
  let f = 0.5;
  if (raining) f = tags.includes("Rainy day") ? 1 : 0.3;
  if (hour >= 17 && tags.includes("Evening")) f = Math.max(f, 1);
  if ((hour >= 21 || hour < 4) && tags.includes("Late night")) f = 1;
  if (hour < 12 && tags.includes("Evening")) f = Math.min(f, 0.3);
  return f;
}
function isLive(p, today) {
  if (p.status === "active" || p.status === "recurring") return true;
  if (p.status === "seasonal") return (!p.seasonStart || p.seasonStart <= today) && (!p.seasonEnd || today <= p.seasonEnd);
  return false;
}
const PRICE = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4
};
const BUDGET = { free: 0, $: 1, $$: 2, $$$: 4 };
function withinBudget(level, budget) {
  if (!budget || !level || !(level in PRICE)) return true;
  return PRICE[level] <= BUDGET[budget];
}
function bostonClock(d) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hour, minute: Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}
function isOpenAt(hours, clock, plusMin = 0) {
  if (!hours?.periods?.length) return null;
  const WEEK = 7 * 1440;
  const t = (clock.day * 1440 + clock.hour * 60 + clock.minute + plusMin) % WEEK;
  for (const p of hours.periods) {
    const o = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    let c = p.close ? p.close.day * 1440 + p.close.hour * 60 + p.close.minute : o + WEEK;
    if (c <= o) c += WEEK;
    if (t >= o && t < c || t + WEEK >= o && t + WEEK < c) return true;
  }
  return false;
}
function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function walkMinutes(lat1, lon1, lat2, lon2) {
  return Math.max(1, Math.ceil(distanceM(lat1, lon1, lat2, lon2) * DETOUR / WALK_M_PER_MIN));
}
function nearestWithin(places, lat, lng, maxM) {
  let best, bd = maxM;
  for (const p of places) {
    const d = distanceM(lat, lng, p.lat, p.lng);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
function pickDiverse(c, n) {
  const out = [];
  const left = [...c];
  while (out.length < n && left.length) {
    const used = new Set(out.map((s) => s.group));
    let bi = 0, bv = -Infinity;
    left.forEach((s, i) => {
      const v = s.score * (used.has(s.group) ? 0.6 : 1);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}
function round(x) {
  return Math.round(x * 1e3) / 1e3;
}
export {
  bostonClock,
  distanceM,
  groupOf,
  isOpenAt,
  suggestNext,
  suggestPlans,
  suggestRoutes,
  walkMinutes
};
