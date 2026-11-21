import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWalkingRoute } from "./google-maps.mjs";

test("normalizes a Google walking route with ordered legs and steps", () => {
  const route = normalizeWalkingRoute({
    path: [{ lat: 42.1, lng: -71.1 }, { lat: 42.2, lng: -71.2 }],
    distanceMeters: 1609,
    durationMillis: 1_800_000,
    warnings: ["Use caution"],
    legs: [{
      distanceMeters: 800,
      durationMillis: 600_000,
      steps: [{ instructions: "Head north", distanceMeters: 200, staticDurationMillis: 120_000 }],
    }],
  });

  assert.deepEqual(route.path, [[42.1, -71.1], [42.2, -71.2]]);
  assert.equal(route.minutes, 30);
  assert.equal(route.legs[0].minutes, 10);
  assert.deepEqual(route.legs[0].steps[0], { instruction: "Head north", meters: 200, minutes: 2 });
});

test("rejects an empty route response", () => {
  assert.throws(() => normalizeWalkingRoute(null), /No walking route/);
});
