import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRoutePayload } from "./routes.mjs";
import { buildSuggestData } from "./suggest-data.mjs";
import { groupOf, suggestRoutes } from "./suggest.mjs";

const saturday2pm = new Date("2026-11-21T19:00:00Z"); // Boston time; fixed so open-now checks don't depend on when tests run

async function keepGoingAfter(walkId) {
  const payload = JSON.parse(await readFile(new URL("../public/routes.json", import.meta.url), "utf8"));
  const walks = normalizeRoutePayload(payload);
  const walk = walks.find(item => item.id === walkId);
  const last = walk.stops.at(-1);
  const { places, transitions } = buildSuggestData(walks);
  const routes = suggestRoutes({
    lat: last.point[0], lng: last.point[1], afterPlaceId: last.placeId,
    exclude: walk.stops.map(stop => stop.placeId), maxWalkMin: 15, when: saturday2pm,
  }, places, transitions, { length: 2, routes: 3 });
  return { walk, last, routes, places };
}

test("suggest data keeps place types, hours and A-then-B transitions", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/routes.json", import.meta.url), "utf8"));
  const { places, transitions } = buildSuggestData(normalizeRoutePayload(payload));
  assert.ok(places.length > 50);
  assert.ok(places.filter(place => place.primaryType).length > places.length / 2, "most places know their type");
  assert.ok(places.some(place => place.hours?.periods?.length), "some places know their hours");
  assert.ok(transitions.length > 50);
});

test("keep going gives three different two-stop routes, not the nearest places three ways", async () => {
  const { walk, routes } = await keepGoingAfter("freedom-trail-lite");
  assert.equal(routes.length, 3);
  assert.ok(routes.every(route => route.stops.length === 2));

  const inPlan = new Set(walk.stops.map(stop => stop.placeId));
  assert.ok(routes.every(route => route.stops.every(stop => !inPlan.has(stop.placeId))), "never suggests a stop already in the plan");

  const firsts = routes.map(route => route.stops[0].placeId);
  assert.equal(new Set(firsts).size, 3, "each route starts somewhere different");
  const inEvery = routes[0].stops.filter(stop => routes.every(route => route.stops.some(other => other.placeId === stop.placeId)));
  assert.equal(inEvery.length, 0, "no single place shows up in all three routes");

  assert.ok(routes.every(route => route.stops[0].reasons.length > 0), "each suggestion has reasons for its card");
});

test("keep going after a bakery doesn't start with another bakery", async () => {
  const { last, routes } = await keepGoingAfter("freedom-trail-lite"); // ends at Bova's Bakery
  assert.equal(groupOf(last.primaryType), "sweet");
  assert.ok(routes.every(route => route.stops.every(stop => stop.group)), "suggestions carry their category");
  assert.ok(routes.every(route => route.stops[0].group !== "sweet" || route.stops[0].reasons.some(r => r.includes("people"))),
    "a sweet stop right after a bakery only if people actually went there next");
});
