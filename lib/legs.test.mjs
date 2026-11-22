import assert from "node:assert/strict";
import test from "node:test";
import { bikeNotQuicker, followSteps, legFresh, legsOf, maneuverIcon, navSteps, splitPathAtStops, travelTotal } from "./legs.mjs";

const stop = (name, lat, lng) => ({ name, point: [lat, lng] });
const walk = { stops: [stop("A", 42.3600, -71.0560), stop("B", 42.3610, -71.0540), stop("C", 42.3500, -71.1000)] };

test("one leg per gap, with a walking estimate", () => {
  const legs = legsOf(walk);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].from.name, "A");
  assert.equal(legs[1].to.name, "C");
  assert.ok(legs[0].estimateMin < legs[1].estimateMin);
  assert.ok(legs[1].straightMeters > 1600, "B to C is long enough to suggest the T");
});

test("travel total uses fetched routes and says when a leg isn't known yet", () => {
  const legs = legsOf(walk);
  const walking = travelTotal(legs, () => "WALKING", () => null);
  assert.equal(walking.known, true);
  const mixed = travelTotal(legs, i => (i === 1 ? "TRANSIT" : "WALKING"), (leg, mode) => (mode === "TRANSIT" ? { status: "ready", result: { minutes: 9 } } : null));
  assert.equal(mixed.minutes, legs[0].estimateMin + 9);
  assert.equal(travelTotal(legs, () => "TRANSIT", () => null).known, false);
});

test("transit legs go stale, walking legs don't", () => {
  const now = 1_000_000;
  assert.equal(legFresh({ status: "ready", at: now - 5 * 60_000 }, "TRANSIT", now), false);
  assert.equal(legFresh({ status: "ready", at: now - 5 * 60_000 }, "WALKING", now), true);
  assert.equal(legFresh({ status: "error" }, "WALKING", now), false);
});

test("a walk's path splits at its stops", () => {
  const path = [[42.3600, -71.0560], [42.3605, -71.0550], [42.3610, -71.0540], [42.3550, -71.0800], [42.3500, -71.1000]];
  const pieces = splitPathAtStops(path, walk.stops);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0].at(-1), [42.3610, -71.0540]);
  assert.deepEqual(pieces[1][0], [42.3610, -71.0540]);
  assert.deepEqual(splitPathAtStops([], walk.stops)[1], [[42.3610, -71.0540], [42.3500, -71.1000]], "no path: straight lines");
});

test("nav steps: walking turns, a ride as one step, then arrival", () => {
  const result = { segments: [
    { kind: "walk", steps: [{ instruction: "Head north", maneuver: "DEPART", meters: 100, end: [42.36, -71.05] }, { instruction: "Turn left onto Hanover St", maneuver: "TURN_LEFT", meters: 50, end: [42.361, -71.05] }] },
    { kind: "transit", meters: 3000, path: [[42.361, -71.05], [42.35, -71.08]], line: { name: "Green Line B" }, headsign: "Boston College", from: "Haymarket", to: "Kenmore", stops: 6 },
  ] };
  const steps = navSteps(result, "Fenway Park");
  assert.deepEqual(steps.map(s => maneuverIcon(s)), ["straight", "turnLeft", "train", "arrive"]);
  assert.equal(steps[2].instruction, "Take the Green Line B toward Boston College");
  assert.match(steps[2].note, /6 stops, get off at Kenmore/);
  assert.equal(steps.at(-1).instruction, "Arrive at Fenway Park");
});

test("arrows read the instruction when there's no maneuver", () => {
  assert.equal(maneuverIcon({ instruction: "Slight right toward Boylston St" }), "slightRight");
  assert.equal(maneuverIcon({ instruction: "Make a U-turn" }), "uturn");
  assert.equal(maneuverIcon({ instruction: "Continue onto Tremont St" }), "straight");
});

test("following your location skips steps you've finished", () => {
  const steps = [{ end: [42.3600, -71.0560] }, { end: [42.3610, -71.0540] }, { end: null }];
  assert.deepEqual(followSteps(steps, 0, null), { index: 0, metersLeft: null }, "no location: stay put");
  const atFirstEnd = followSteps(steps, 0, [42.36001, -71.05601]);
  assert.equal(atFirstEnd.index, 1);
  assert.ok(atFirstEnd.metersLeft > 100);
});

test("biking a short leg through walk-only paths isn't quicker than walking", () => {
  const leg = { estimateMin: 5 };
  assert.equal(bikeNotQuicker(leg, { status: "ready", result: { minutes: 8 } }), true, "Boston Common to Granary: 8 min by bike");
  assert.equal(bikeNotQuicker(leg, { status: "ready", result: { minutes: 2 } }), false);
  assert.equal(bikeNotQuicker(leg, { status: "loading" }), false, "no note until the route is in");
});
