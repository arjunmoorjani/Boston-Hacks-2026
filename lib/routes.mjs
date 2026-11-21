const foodPattern = /cannoli|cocoa|dessert|hot-pot|brewery|tea-party/i;
const waterfrontPattern = /harbor|waterfront|seaport|fan-pier|eastie|beach|esplanade|riverbank|smoot-bridge/i;
const naturePattern = /arboretum|fens|garden|cemetery|community-path|tree-lighting/i;
const shoppingPattern = /book|market|thrift|window-walk/i;
const culturePattern = /art|museum|library|freedom-trail|mit-corridor/i;

function categoryFor(plan) {
  const text = `${plan.slug || ""} ${plan.name || ""} ${plan.neighborhood || ""}`;
  if (foodPattern.test(text)) return "Food";
  if (waterfrontPattern.test(text)) return "Waterfront";
  if (naturePattern.test(text)) return "Nature";
  if (shoppingPattern.test(text)) return "Shopping";
  if (culturePattern.test(text)) return "Culture";
  return "City";
}

function symbolFor(category) {
  if (category === "Food") return "cone";
  if (category === "Waterfront") return "waves";
  return "route";
}

function normalizeStop(stop, index) {
  const rawLatitude = stop.latitude ?? stop.lat;
  const rawLongitude = stop.longitude ?? stop.lng;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!stop.name || rawLatitude == null || rawLongitude == null
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return {
    id: stop.id || stop.placeId || `${stop.name}-${index + 1}`,
    placeId: stop.placeId || null,
    priceLevel: stop.priceLevel ?? null,
    // place details from enrich: "Keep going" uses them for what fits next and what's open
    primaryType: stop.primaryType ?? null,
    hours: stop.hours ?? null,
    name: stop.name,
    address: stop.address || stop.query || "",
    note: stop.note || "A stop on this walk.",
    point: [latitude, longitude],
  };
}

function normalizeRoutePath(route, stops) {
  if (route?.type !== "LineString" || !Array.isArray(route.coordinates)) {
    return stops.map(stop => stop.point);
  }

  const path = route.coordinates.flatMap(coordinate => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return [];
    const [rawLongitude, rawLatitude] = coordinate;
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (rawLatitude == null || rawLongitude == null
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    return [[latitude, longitude]];
  });

  return path.length >= 2 ? path : stops.map(stop => stop.point);
}

export function normalizeRoutePayload(payload) {
  const plans = Array.isArray(payload) ? payload : payload?.plans;
  if (!Array.isArray(plans)) throw new Error("routes.json must contain a plans array.");

  return plans.flatMap((plan, planIndex) => {
    if (plan.status && plan.status !== "active") return [];
    const orderedStops = [...(plan.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const stops = orderedStops.map(normalizeStop).filter(Boolean);
    if (stops.length < 2) return [];

    const id = plan.id || plan.slug || `route-${planIndex + 1}`;
    const title = plan.title || plan.name || id;
    const area = plan.area || plan.neighborhood || "Boston";
    const category = plan.category || categoryFor(plan);
    const description = plan.description || `${stops.length} stops through ${area}: ${stops.map(stop => stop.name).join(", ")}.`;

    return [{
      id,
      title,
      area,
      category,
      symbol: plan.symbol || symbolFor(category),
      description,
      stops,
      path: normalizeRoutePath(plan.route, stops),
      source: "routes.json",
      durationMin: plan.durationMin ?? null,
      walkMi: plan.walkMi ?? null,
      cost: plan.cost ?? null,
      tags: plan.tags || [],
      tStation: plan.tStation || null,
      tLines: plan.tLines || [],
    }];
  });
}

export async function loadRoutes({ fetcher = fetch, signal } = {}) {
  const response = await fetcher("/routes.json", { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Couldn’t load routes.json (${response.status}).`);
  return normalizeRoutePayload(await response.json());
}

export function filterRoutesByCategory(routes, disabledCategories) {
  const disabled = new Set(disabledCategories);
  return routes.filter(route => !disabled.has(route.category));
}

export function routesForMap(routes, selectedId, routeResults = {}) {
  const visible = selectedId ? routes.filter(route => route.id === selectedId) : routes;
  return visible.map(route => routeResults[route.id] ? { ...route, ...routeResults[route.id] } : route);
}
