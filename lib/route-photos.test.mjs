import assert from "node:assert/strict";
import test from "node:test";
import { loadPhotoAlbum, PHOTO_PAGE_SIZE, photoStopOptions } from "./route-photos.mjs";

test("photo tags keep the database positions of stops with unique Google IDs", () => {
  assert.deepEqual(photoStopOptions([
    { placeId: "first", label: "Coffee" }, { label: "Dropped pin" },
    { placeId: "first", label: "Coffee again" }, { placeId: "last", label: "Park" },
  ]), [
    { placeId: "first", label: "Coffee", position: 1 },
    { placeId: "last", label: "Park", position: 4 },
  ]);
});

test("album signs the current account's photo page and keeps older untagged photos", async () => {
  const calls = [];
  const rows = Array.from({ length: PHOTO_PAGE_SIZE + 1 }, (_, index) => ({
    id: `photo-${index}`, storage_path: `path-${index}`, stop_position: index === 0 ? 3 : null,
    activities: { id: "activity", name: "Coffee walk", popular_route_id: null },
    activity_stops: index === 0 ? { places: { google_place_id: "coffee" } } : null,
  }));
  const query = {
    select() { return this; },
    eq(...args) { calls.push(args); return this; },
    order() { return this; },
    range(first, last) { calls.push([first, last]); return { data: rows }; },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "owner" } } } }) },
    from: name => { assert.equal(name, "activity_photos"); return query; },
    storage: { from: () => ({
      createSignedUrls: async paths => ({ data: paths.toReversed().map(path => ({ path, signedUrl: `signed-${path}` })) }),
    }) },
  };

  const result = await loadPhotoAlbum(client, PHOTO_PAGE_SIZE);
  assert.deepEqual(calls, [["activities.user_id", "owner"], ["activities.status", "completed"], [PHOTO_PAGE_SIZE, 2 * PHOTO_PAGE_SIZE]]);
  assert.equal(result.photos.length, PHOTO_PAGE_SIZE);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.photos[0], {
    id: "photo-0", url: "signed-path-0", route: { id: "activity", title: "Coffee walk", sharedRouteId: null },
    stopPosition: 3, placeId: "coffee",
  });
  assert.equal(result.photos[1].stopPosition, null);
  assert.equal(result.photos[1].placeId, null);
});

test("an unopened guest account has an empty album without signing in", async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  assert.deepEqual(await loadPhotoAlbum(client), { photos: [], hasMore: false });
});
