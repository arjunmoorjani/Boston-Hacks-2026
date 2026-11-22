import test from "node:test";
import assert from "node:assert/strict";
import { nearestArea, nearestStation, stationCandidates, withExcursionCardMeta, withNearestTStop } from "./excursion-card-meta.mjs";

const catalog = [
  { tStation: "Kenmore", tLines: ["Green-B", "Green-C"], stops: [{ point: [42.3489, -71.0958] }] },
  { tStation: "Coolidge Corner", tLines: ["Green-C"], stops: [{ point: [42.3422, -71.1212] }] },
  { tStation: "Kendall/MIT", tLines: ["Red"], stops: [{ point: [42.3624, -71.0862] }] },
  { tStation: "Kendall/MIT", tLines: ["Red"], stops: [{ point: [42.3630, -71.0880] }] },
  { tStation: "Kendall/MIT", tLines: ["Red"], stops: [{ point: [0, 0] }] },
];

test("custom excursion metadata comes from its first stop", () => {
  const walk = withExcursionCardMeta({
    id: "logged:1", category: "Logged excursion", minutes: 47,
    stops: [{ point: [42.3455, -71.0985] }, { point: [42.35, -71.10] }],
  }, catalog);
  assert.equal(walk.area, "Fenway");
  assert.equal(walk.durationMin, 47);
  assert.equal(walk.tStation, "Kenmore");
  assert.deepEqual(walk.tLines, ["Green-B", "Green-C"]);
});

test("Brookline card areas use the municipality name", () => {
  assert.equal(nearestArea([42.3422, -71.1212]), "Brookline");
  assert.equal(nearestStation([42.3422, -71.1212], catalog).name, "Coolidge Corner");
});

test("station centers use a median so one malformed route cannot move the station", () => {
  const kendall = stationCandidates(catalog).find(station => station.name === "Kendall/MIT");
  assert.ok(kendall.point[0] > 42);
  assert.ok(kendall.point[1] < -71);
});

test("an existing card missing transit metadata gets the nearest stop", () => {
  const walk = withNearestTStop({ id: "old-card", stops: [{ point: [42.343, -71.12] }] }, catalog);
  assert.equal(walk.tStation, "Coolidge Corner");
  assert.deepEqual(walk.tLines, ["Green-C"]);
});
