import assert from "node:assert/strict";
import test from "node:test";
import { localPlaceMatches, mergePlaceResults, MAX_RESULTS } from "./place-search.mjs";

const places = [
  { placeId: "a", name: "Mike's Pastry", address: "300 Hanover St", lat: 1, lng: 2, popularity: 3 },
  { placeId: "b", name: "Modern Pastry", address: "257 Hanover St", lat: 1, lng: 2, popularity: 1 },
  { placeId: "c", name: "Café Vittoria", address: "290 Hanover St", lat: 1, lng: 2, popularity: 1 },
];

test("finds our stops by name, ignoring apostrophes, accents and case", () => {
  assert.deepEqual(localPlaceMatches(places, "mikes pastry").map(p => p.placeId), ["a"]);
  assert.deepEqual(localPlaceMatches(places, "pastry").map(p => p.placeId), ["a", "b"], "more walks first");
  assert.deepEqual(localPlaceMatches(places, "cafe vit").map(p => p.placeId), ["c"]);
  assert.deepEqual(localPlaceMatches(places, "  "), []);
  assert.equal(localPlaceMatches(places, "pastry")[0].onWalks, 3);
});

test("our stops come first, no repeats, capped", () => {
  const local = localPlaceMatches(places, "pastry");
  const google = [{ placeId: "a", name: "Mike's Pastry" }, ...Array.from({ length: 8 }, (_, i) => ({ placeId: `g${i}`, name: `Pastry ${i}` }))];
  const merged = mergePlaceResults(local, google);
  assert.equal(merged.length, MAX_RESULTS);
  assert.deepEqual(merged.slice(0, 3).map(p => p.placeId), ["a", "b", "g0"]);
});
