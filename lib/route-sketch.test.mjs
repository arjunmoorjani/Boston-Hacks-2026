import assert from "node:assert/strict";
import test from "node:test";
import { sketchRoute } from "./route-sketch.mjs";

const stop = (lat, lng) => ({ point: [lat, lng] });

test("a route fits inside the box, north up, with its stops", () => {
  const path = [[42.36, -71.06], [42.362, -71.058], [42.365, -71.055]];
  const sketch = sketchRoute(path, [stop(42.36, -71.06), stop(42.365, -71.055)], 72, 9);
  assert.match(sketch.d, /^M[\d.]+ [\d.]+L/);
  for (const [x, y] of sketch.stops) {
    assert.ok(x >= 0 && x <= 72 && y >= 0 && y <= 72);
  }
  const [first, last] = sketch.stops;
  assert.ok(last[1] < first[1], "the northern stop is drawn higher");
  assert.ok(last[0] > first[0], "the eastern stop is drawn to the right");
});

test("no path: draws straight lines between the stops; nothing to draw: null", () => {
  assert.ok(sketchRoute([], [stop(42.36, -71.06), stop(42.37, -71.05)]).d.includes("L"));
  assert.equal(sketchRoute([], [stop(42.36, -71.06)]), null);
});
