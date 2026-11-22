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
  assert.deepEqual(place, { placeId: "p", name: "Regina Pizzeria", point: [42.36, -71.05], icon: "restaurant", color: "#F57C00", rank: 0, type: "pizza_restaurant" });
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

test("park and T names: one per station name, real parks only, by prominence for the zoom", async () => {
  const { parkAndTNames } = await import("./nearby-places.mjs");
  const places = [
    { placeId: "p1", name: "Boston Common", icon: "park", rank: 0 },
    { placeId: "p2", name: "National Parks & Conservation", icon: "park", rank: 1 },
    { placeId: "p3", name: "Beacon St @ Park St", icon: "park", rank: 2 },
    { placeId: "p4", name: "Temple Street Park", icon: "park", rank: 9 },
    { placeId: "t1", name: "Park Street", icon: "train", rank: 0 },
    { placeId: "t2", name: "Park Street", icon: "train", rank: 1 },
    { placeId: "r", name: "Mike's Pastry", icon: "bakery", rank: 0 },
  ];
  assert.deepEqual(parkAndTNames(places, 15).map(p => p.placeId), ["t1", "p1"]);
  assert.deepEqual(parkAndTNames(places, 17).map(p => p.placeId), ["t1", "p1", "p4"]);
});

test("real parks only, and actual parks beat plazas and playgrounds", async () => {
  const { isRealPark, parkAndTNames } = await import("./nearby-places.mjs");
  assert.equal(isRealPark({ name: "Boston Common", icon: "park", type: "park" }), true);
  assert.equal(isRealPark({ name: "Robin Williams Park Bench", icon: "park", type: "tourist_attraction" }), false);
  assert.equal(isRealPark({ name: "John Paul II Placard", icon: "park", type: "monument" }), false);
  assert.equal(isRealPark({ name: "Robin Williams Park Bench From \"Good Will Hunting\"", icon: "park", type: "park" }), false);
  assert.equal(isRealPark({ name: "Boston Common Carousel", icon: "park", type: "park" }), false);
  assert.equal(isRealPark({ name: "Patrick Andrew Collins memorial", icon: "park", type: "park" }), false);
  assert.equal(isRealPark({ name: "Cardinal Cushing Memorial Park", icon: "park", type: "park" }), true);
  assert.equal(isRealPark({ name: "Bathroom / Fountains", icon: "park", type: "park" }), false);
  assert.equal(isRealPark({ name: "Fiedler Dock", icon: "park", type: "park" }), false);
  const names = parkAndTNames([
    { placeId: "plaza", name: "Levinson Plaza", icon: "park", type: "plaza", rank: 0 },
    { placeId: "common", name: "Boston Common", icon: "park", type: "park", rank: 2 },
  ], 15).map(p => p.placeId);
  assert.deepEqual(names, ["common", "plaza"]);
});
