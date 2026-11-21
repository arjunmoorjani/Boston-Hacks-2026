import assert from "node:assert/strict";
import test from "node:test";
import { distanceLabel, minutesLabel, normalizeDirections, timeLabel } from "./directions.mjs";

const walkStep = (instructions, meters, seconds, path) => ({ travelMode: "WALKING", instructions, distanceMeters: meters, staticDurationMillis: seconds * 1000, path });
const now = new Date("2026-11-21T22:00:00Z"); // 5:00 PM in Boston

test("groups walking steps around a ride, like Google Maps", () => {
  const route = {
    durationMillis: 30 * 60_000, distanceMeters: 5000, localizedValues: { transitFare: "$2.40" }, warnings: [],
    path: [{ lat: 42.35, lng: -71.1 }, { lat: 42.36, lng: -71.05 }],
    legs: [{ steps: [
      walkStep("Head west", 100, 60, [{ lat: 42.35, lng: -71.1 }, { lat: 42.351, lng: -71.101 }]),
      walkStep("Turn left onto St Mary's St\nDestination will be on the right", 200, 120, [{ lat: 42.351, lng: -71.101 }]),
      { travelMode: "TRANSIT", distanceMeters: 4500, staticDurationMillis: 20 * 60_000, path: [{ lat: 42.351, lng: -71.101 }, { lat: 42.36, lng: -71.06 }],
        transitDetails: { headsign: "Government Center", stopCount: 9, departureStop: { name: "BU Central" }, arrivalStop: { name: "Government Center" },
          departureTime: new Date("2026-11-21T22:04:00Z"), transitLine: { name: "Green Line B", shortName: "B", color: "#00843d", textColor: "#ffffff", vehicle: { name: "Light rail" } } } },
      walkStep("Head northeast", 300, 240, [{ lat: 42.36, lng: -71.06 }, { lat: 42.36, lng: -71.05 }]),
    ] }],
  };
  const d = normalizeDirections(route, "TRANSIT", now);
  assert.deepEqual(d.segments.map(s => s.kind), ["walk", "transit", "walk"]);
  assert.equal(d.segments[0].minutes, 3);
  assert.equal(d.segments[0].meters, 300);
  assert.equal(d.segments[0].toStop, "BU Central", "the first walk ends where you board");
  assert.equal(d.segments[0].steps[1].instruction, "Turn left onto St Mary's St");
  assert.equal(d.segments[0].steps[1].note, "Destination will be on the right");
  assert.equal(d.segments[1].line.name, "Green Line B");
  assert.equal(d.segments[1].stops, 9);
  assert.equal(d.segments[2].toStop, null, "the last walk ends at the destination");
  assert.equal(d.fare, "$2.40");
  assert.equal(d.minutes, 30);
  assert.equal(timeLabel(d.arriveAt), "5:30 PM");
  assert.equal(timeLabel(d.segments[1].departAt), "5:04 PM");
});

test("a walking route is one walk segment", () => {
  const d = normalizeDirections({ durationMillis: 600_000, distanceMeters: 800, legs: [{ steps: [walkStep("Head north", 800, 600, [])] }] }, "WALKING", now);
  assert.equal(d.segments.length, 1);
  assert.equal(d.segments[0].kind, "walk");
  assert.equal(d.fare, null);
});

test("no route gives a helpful error", () => {
  assert.throws(() => normalizeDirections(undefined, "TRANSIT", now), /No transit route/);
  assert.throws(() => normalizeDirections({}, "WALKING", now), /No walking route/);
});

test("labels", () => {
  assert.equal(minutesLabel(0.2), "1 min");
  assert.equal(minutesLabel(75), "1 h 15 min");
  assert.equal(minutesLabel(60), "1 h");
  assert.equal(distanceLabel(1609.344), "1.0 mi");
  assert.equal(distanceLabel(50), "160 ft");
});

test("a bike route is one bike segment, with walking bits kept apart", () => {
  const bikeStep = (instructions, meters, seconds) => ({ travelMode: "BICYCLING", instructions, distanceMeters: meters, staticDurationMillis: seconds * 1000, path: [] });
  const d = normalizeDirections({ durationMillis: 900_000, distanceMeters: 3000, legs: [{ steps: [
    bikeStep("Head east on Comm Ave", 2000, 480), bikeStep("Turn left", 900, 300), walkStep("Walk your bike across the plaza", 100, 120, []),
  ] }] }, "BICYCLING", now);
  assert.deepEqual(d.segments.map(s => s.kind), ["bike", "walk"]);
  assert.equal(d.segments[0].meters, 2900);
  assert.equal(d.segments[0].steps.length, 2);
  assert.throws(() => normalizeDirections(undefined, "BICYCLING", now), /No bike route/);
});

test("a driving route is one drive segment", () => {
  const driveStep = (instructions, meters, seconds) => ({ travelMode: "DRIVING", instructions, distanceMeters: meters, staticDurationMillis: seconds * 1000, path: [] });
  const d = normalizeDirections({ durationMillis: 840_000, distanceMeters: 6000, legs: [{ steps: [driveStep("Head north on Tremont St", 2000, 300), driveStep("Merge onto I-93 N", 4000, 400)] }] }, "DRIVING", now);
  assert.deepEqual(d.segments.map(s => s.kind), ["drive"]);
  assert.equal(d.segments[0].steps.length, 2);
  assert.equal(d.minutes, 14);
  assert.equal(d.segments[0].minutes, 14, "the drive shows the traffic-aware total, not the no-traffic step times");
  assert.throws(() => normalizeDirections(undefined, "DRIVING", now), /No driving route/);
});
