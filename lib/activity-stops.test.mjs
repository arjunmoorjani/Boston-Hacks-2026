import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { deleteUnfinishedActivity, insertActivityStop, loadActivityStopIds, resolvePlaceIds } from "./activity-stops.mjs";

function mockDatabase(responses) {
  const requests = [];
  const supabase = createClient("https://example.test", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (url, { method, body }) => {
        requests.push({ url: new URL(url), method, body: body && JSON.parse(body) });
        const [status, data] = responses.shift();
        return new Response(data === null ? null : JSON.stringify(data), {
          status, headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return { supabase, requests };
}

test("resolves external Google IDs to internal place IDs regardless of lookup order", async () => {
  const { supabase, requests } = mockDatabase([
    [201, null],
    [200, [{ id: "uuid-b", google_place_id: "google-b" }, { id: "uuid-a", google_place_id: "google-a" }]],
  ]);
  const ids = await resolvePlaceIds(supabase, ["google-a", "google-b", "google-a"]);
  assert.deepEqual(requests[0].body, [{ google_place_id: "google-a" }, { google_place_id: "google-b" }]);
  assert.equal(ids.get("google-a"), "uuid-a");
  assert.equal(ids.get("google-b"), "uuid-b");
});

test("reads saved stops with explicit ascending position and external IDs", async () => {
  const { supabase, requests } = mockDatabase([[200, [
    { position: 1, places: { google_place_id: "google-b" } },
    { position: 2, places: { google_place_id: "google-a" } },
  ]]]);
  assert.deepEqual(await loadActivityStopIds(supabase, "outing"), ["google-b", "google-a"]);
  assert.equal(requests[0].url.searchParams.get("order"), "position.asc");
  assert.equal(requests[0].url.searchParams.get("activity_id"), "eq.outing");
});

test("accepts a retried stop write only if the saved position contains the same place", async () => {
  for (const savedId of ["uuid-a", "uuid-b"]) {
    const { supabase, requests } = mockDatabase([
      [409, { code: "23505", message: "duplicate stop" }],
      [200, [{ place_id: savedId }]],
    ]);
    const write = insertActivityStop(supabase, "outing", 2, "uuid-a");
    if (savedId === "uuid-a") await write;
    else await assert.rejects(write, { message: "duplicate stop" });
    assert.deepEqual(requests[0].body, { activity_id: "outing", position: 2, place_id: "uuid-a" });
    assert.equal(requests[1].url.searchParams.get("position"), "eq.2");
  }
});

test("checks that compensating cleanup actually removed an unfinished activity", async () => {
  const removed = mockDatabase([[204, null], [200, []]]);
  await deleteUnfinishedActivity(removed.supabase, "outing");
  assert.equal(removed.requests[0].method, "DELETE");
  assert.equal(removed.requests[0].url.searchParams.get("id"), "eq.outing");

  const remaining = mockDatabase([[204, null], [200, [{ id: "outing" }]]]);
  await assert.rejects(deleteUnfinishedActivity(remaining.supabase, "outing"), /Could not confirm removal/);
});
