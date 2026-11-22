import assert from "node:assert/strict";
import test from "node:test";
import { CELL_DEG, byDistanceTo, cellsFor, colorFor, toMarkerPlace } from "./nearby-places.mjs";

test("a street-zoom view is covered by a handful of cells, nearest first", () => {
  const bounds = { north: 42.3660, south: 42.3610, east: -71.0520, west: -71.0600 }; // about the North End on a phone
  const cells = cellsFor(bounds);
  assert.ok(cells.length >= 2 && cells.length <= 9, `${cells.length} cells`);
  assert.equal(new Set(cells.map(c => c.key)).size, cells.length);
  const center = [42.3635, -71.0560];
  const sorted = byDistanceTo(center, cells);
  const d = c => Math.hypot(c.center[0] - center[0], c.center[1] - center[1]);
  assert.ok(d(sorted[0]) <= d(sorted.at(-1)));
  assert.ok(d(sorted[0]) < CELL_DEG);
});

test("places get our icon and Google's category color", () => {
  const place = toMarkerPlace({ id: "p", displayName: "Regina Pizzeria", primaryType: "pizza_restaurant", location: { lat: () => 42.36, lng: () => -71.05 } });
  assert.deepEqual(place, { placeId: "p", name: "Regina Pizzeria", point: [42.36, -71.05], icon: "restaurant", color: "#F57C00", rank: 0 });
  assert.equal(colorFor("park"), "#34A853");
  assert.equal(colorFor("train"), "#1B2A4A");
  assert.equal(colorFor("shopping"), "#4285F4");
  assert.equal(colorFor("nonsense"), colorFor("place"));
});

test("prominence decides the zoom a place shows at; landmarks a level earlier", async () => {
  const { byProminence, minZoomFor } = await import("./nearby-places.mjs");
  assert.equal(minZoomFor({ rank: 0, icon: "restaurant" }), 15);
  assert.equal(minZoomFor({ rank: 5, icon: "restaurant" }), 16);
  assert.equal(minZoomFor({ rank: 15, icon: "cafe" }), 17);
  assert.equal(minZoomFor({ rank: 5, icon: "museum" }), 15, "landmarks one level earlier");
  assert.equal(minZoomFor({ rank: 0, icon: "park" }), 15, "never farther out than markers load");
  const order = byProminence([
    { placeId: "late", rank: 12, icon: "cafe" }, { placeId: "top", rank: 1, icon: "bar" }, { placeId: "museum", rank: 6, icon: "museum" },
  ]).map(p => p.placeId);
  assert.deepEqual(order, ["top", "museum", "late"]);
});
