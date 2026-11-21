const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

export const googleMapsConfigured = Boolean(apiKey);
export const googleMapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

let loading;

export function loadGoogleMaps() {
  if (!apiKey) return Promise.reject(new Error("Google Maps API key is missing."));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callback = "sidewalkGoogleMapsReady";
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      previousAuthFailure?.();
      window.dispatchEvent(new Event("sidewalk-google-auth-failure"));
    };
    window[callback] = () => {
      delete window[callback];
      resolve(window.google.maps);
    };
    script.onerror = () => {
      delete window[callback];
      script.remove();
      loading = undefined;
      reject(new Error("Couldn’t load Google Maps."));
    };
    const params = new URLSearchParams({ key: apiKey, loading: "async", callback, v: "weekly" });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    document.head.append(script);
  });

  return loading;
}

export function mapPoint([lat, lng]) {
  return { lat, lng };
}

export async function buildWalkingRoute(stops) {
  const maps = await loadGoogleMaps();
  const { Route } = await maps.importLibrary("routes");
  const points = stops.map(stop => mapPoint(stop.point));
  const { routes } = await Route.computeRoutes({
    origin: points[0],
    destination: points.at(-1),
    intermediates: points.slice(1, -1).map(location => ({ location })),
    travelMode: "WALKING",
    fields: ["path", "distanceMeters", "durationMillis", "warnings"],
  });
  const route = routes?.[0];
  if (!route?.path?.length) throw new Error("No walking route found for these stops.");

  return {
    path: route.path.map(({ lat, lng }) => [lat, lng]),
    meters: route.distanceMeters,
    minutes: route.durationMillis / 60000,
    warnings: route.warnings ?? [],
  };
}
