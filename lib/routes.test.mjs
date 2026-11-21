import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterRoutesByCategory, loadRoutes, normalizeRoutePayload, routesForMap } from "./routes.mjs";

test("normalizes the attached enriched plans in itinerary order", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/routes.json", import.meta.url), "utf8"));
  const routes = normalizeRoutePayload(payload);

  assert.equal(routes.length, 35);
  assert.ok(routes.every(route => route.id && route.title && route.category && route.description));
  assert.ok(routes.every(route => route.stops.length >= 2));
  assert.ok(routes.every(route => route.stops.every(stop => Number.isFinite(stop.point[0]) && Number.isFinite(stop.point[1]))));
  assert.ok(routes.every(route => route.stops.every(stop => stop.point[0] !== 0 && stop.point[1] !== 0)));

  const cannoli = routes.find(route => route.id === "cannoli-showdown");
  assert.deepEqual(cannoli.stops.map(stop => stop.name), ["Mike's Pastry", "Modern Pastry", "Bova's Bakery"]);
  assert.ok(cannoli.path.length > cannoli.stops.length);
  assert.deepEqual(cannoli.path[0], [42.36416, -71.05419]);
  assert.equal(routes.find(route => route.id === "market-to-harbor").category, "Waterfront");
  assert.equal(routes.find(route => route.id === "arboretum-winter-walk").category, "Nature");
  assert.equal(routes.find(route => route.id === "chinatown-dessert-run").category, "Food");
});

test("loads routes through the replaceable fetch boundary", async () => {
  const payload = { plans: [{
    slug: "test-walk", name: "Test Walk", neighborhood: "Boston", status: "active",
    stops: [
      { name: "Second", lat: 42.2, lng: -71.2, order: 2 },
      { name: "First", lat: 42.1, lng: -71.1, order: 1 },
    ],
  }] };
  const calls = [];
  const routes = await loadRoutes({ fetcher: async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => payload };
  } });

  assert.equal(calls[0][0], "/routes.json");
  assert.deepEqual(routes[0].stops.map(stop => stop.name), ["First", "Second"]);
});

test("filters disabled route categories without changing the source list", () => {
  const routes = [
    { id: "food", category: "Food" },
    { id: "nature", category: "Nature" },
    { id: "water", category: "Waterfront" },
  ];

  assert.deepEqual(filterRoutesByCategory(routes, ["Nature"]).map(route => route.id), ["food", "water"]);
  assert.equal(routes.length, 3);
});

test("shows all visible routes until one route is selected", () => {
  const routes = [
    { id: "food", path: [[1, 1]] },
    { id: "nature", path: [[2, 2]] },
  ];
  const calculated = { nature: { path: [[3, 3]], legs: [{ minutes: 5 }] } };

  assert.deepEqual(routesForMap(routes, null).map(route => route.id), ["food", "nature"]);
  assert.deepEqual(routesForMap(routes, "nature", calculated), [{
    id: "nature", path: [[3, 3]], legs: [{ minutes: 5 }],
  }]);
});

test("does not turn missing coordinates into a route through zero zero", () => {
  const routes = normalizeRoutePayload({ plans: [{
    id: "missing-point",
    stops: [
      { name: "Missing", latitude: null, longitude: null, order: 1 },
      { name: "First", latitude: 42.35, longitude: -71.06, order: 2 },
      { name: "Second", latitude: 42.36, longitude: -71.07, order: 3 },
    ],
  }] });

  assert.deepEqual(routes[0].path, [[42.35, -71.06], [42.36, -71.07]]);
});

test("normalizes GeoJSON road geometry from longitude latitude order", () => {
  const routes = normalizeRoutePayload({ plans: [{
    id: "road-following",
    stops: [
      { name: "First", lat: 42.35, lng: -71.06 },
      { name: "Second", lat: 42.36, lng: -71.07 },
    ],
    route: { type: "LineString", coordinates: [
      [-71.06, 42.35], [-71.065, 42.352], [-71.07, 42.36],
    ] },
  }] });

  assert.deepEqual(routes[0].path, [
    [42.35, -71.06], [42.352, -71.065], [42.36, -71.07],
  ]);
});
