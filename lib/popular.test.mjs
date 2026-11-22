import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSharedRoute, popularWalkIds, rankSharedWalks } from "./popular.mjs";

const stops = (...placeIds) => placeIds.map(placeId => ({ placeId }));
const routes = [
  { id: "first", name: "First walk", placeIds: ["one", "two"], completedUsers: 1 },
  { id: "second", name: "Second walk", placeIds: ["two", "three"], completedUsers: 2 },
  { id: "third", name: "Third walk", placeIds: ["one", "three"], completedUsers: 0 },
];

test("a log matches only a unique shared route with the same Google Place IDs in order", () => {
  assert.equal(matchSharedRoute(routes, stops("one", "two"))?.id, "first");
  assert.equal(matchSharedRoute(routes, stops("two", "one")), null);
  assert.equal(matchSharedRoute(routes, stops("one", null)), null);
  assert.equal(matchSharedRoute([...routes, { ...routes[0], id: "copy" }], stops("one", "two")), null);
});

test("the catalog ranks shared routes by distinct completers and keeps zero-count walks", () => {
  const walks = [
    { id: "a", title: "First walk", stops: stops("one", "two") },
    { id: "b", title: "Second walk", stops: stops("two", "three") },
    { id: "c", title: "Third walk", stops: stops("one", "three") },
    { id: "local", title: "Unseeded walk", stops: stops("one", "two") },
  ];
  const ranked = rankSharedWalks(walks, routes);
  assert.deepEqual(ranked.map(walk => walk.id), ["b", "a", "c", "local"]);
  assert.deepEqual(ranked.map(walk => walk.popularRouteId), ["second", "first", "third", undefined]);
  assert.deepEqual([...popularWalkIds(ranked)], ["b", "a"]);
  assert.deepEqual([...popularWalkIds(ranked, 1)], ["b"]);
});
