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
  const latitude = Number(stop.latitude ?? stop.lat);
  const longitude = Number(stop.longitude ?? stop.lng);
  if (!stop.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: stop.id || stop.placeId || `${stop.name}-${index + 1}`,
    placeId: stop.placeId || null,
    name: stop.name,
    address: stop.address || stop.query || "",
    note: stop.note || "A stop on this walk.",
    point: [latitude, longitude],
  };
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
      path: stops.map(stop => stop.point),
      source: "routes.json",
      durationMin: plan.durationMin ?? null,
      walkMi: plan.walkMi ?? null,
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
