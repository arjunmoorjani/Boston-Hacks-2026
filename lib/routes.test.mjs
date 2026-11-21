import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterRoutesByCategory, loadRoutes, normalizeRoutePayload } from "./routes.mjs";

test("normalizes the attached enriched plans in itinerary order", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/routes.json", import.meta.url), "utf8"));
  const routes = normalizeRoutePayload(payload);

  assert.equal(routes.length, 37);
  assert.ok(routes.every(route => route.id && route.title && route.category && route.description));
  assert.ok(routes.every(route => route.stops.length >= 2));
  assert.ok(routes.every(route => route.stops.every(stop => Number.isFinite(stop.point[0]) && Number.isFinite(stop.point[1]))));

  const cannoli = routes.find(route => route.id === "cannoli-showdown");
  assert.deepEqual(cannoli.stops.map(stop => stop.name), ["Mike's Pastry", "Modern Pastry", "Bova's Bakery"]);
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
