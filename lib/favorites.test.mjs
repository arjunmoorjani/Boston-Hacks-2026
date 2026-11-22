import assert from "node:assert/strict";
import test from "node:test";
import { emptyProfile, toggleFavorite } from "./profile-store.mjs";

test("hearting adds a walk to the front of favorites; hearting again removes it", () => {
  assert.deepEqual(emptyProfile().favorites, []);
  let favorites = toggleFavorite([], "cannoli-showdown");
  favorites = toggleFavorite(favorites, "freedom-trail-lite");
  assert.deepEqual(favorites, ["freedom-trail-lite", "cannoli-showdown"]);
  assert.deepEqual(toggleFavorite(favorites, "cannoli-showdown"), ["freedom-trail-lite"]);
  assert.deepEqual(toggleFavorite(undefined, "a"), ["a"], "older saved profiles have no favorites yet");
});
