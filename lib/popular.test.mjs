import assert from "node:assert/strict";
import test from "node:test";
import { popularWalkIds } from "./popular.mjs";

const walk = (id, ...placeIds) => ({ id, stops: placeIds.map(placeId => ({ placeId })) });
const walks = [walk("a", "p1", "p2"), walk("b", "p1", "p3"), walk("c", "p4"), walk("d", "p2", "p1")];

test("walks sharing go-to places rank first; a walk with nothing shared isn't popular", () => {
  const ids = popularWalkIds(walks, [], 3);
  assert.deepEqual([...ids].sort(), ["a", "b", "d"]);
  assert.equal(ids.has("c"), false);
});

test("walks you've finished count too", () => {
  assert.ok(popularWalkIds(walks, [{ walkId: "c" }, { walkId: "c" }], 1).has("c"));
});
