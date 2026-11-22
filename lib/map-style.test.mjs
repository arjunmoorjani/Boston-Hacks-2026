import assert from "node:assert/strict";
import test from "node:test";
import { MONO_STYLE, ROUTE_THEME, placeIconFor, stopMarker } from "./map-style.mjs";

test("monochrome style hides business icons but keeps parks, attractions and rail stations", () => {
  const rule = (featureType, elementType) => MONO_STYLE.find(r => r.featureType === featureType && r.elementType === elementType);
  assert.deepEqual(rule("poi").stylers, [{ visibility: "off" }]);
  assert.deepEqual(rule("poi.park").stylers, [{ visibility: "on" }]);
  assert.deepEqual(rule("poi.attraction").stylers, [{ visibility: "on" }]);
  assert.deepEqual(rule("transit.station.rail").stylers, [{ visibility: "on" }]);
});

test("place types map to category icons", () => {
  assert.equal(placeIconFor("italian_restaurant"), "restaurant");
  assert.equal(placeIconFor("city_park"), "park");
  assert.equal(placeIconFor("botanical_garden"), "park");
  assert.equal(placeIconFor("art_museum"), "museum");
  assert.equal(placeIconFor("book_store"), "books");
  assert.equal(placeIconFor("pastry_shop"), "bakery", "a pastry shop is a bakery, not shopping");
  assert.equal(placeIconFor("cafe"), "cafe");
  assert.equal(placeIconFor("brewery"), "bar");
  assert.equal(placeIconFor("farmers_market"), "shopping");
  assert.equal(placeIconFor("route", "Newbury Street"), "street");
});

test("stops without a usable type get an icon from their name, else a place pin", () => {
  assert.equal(placeIconFor(null, "Newbury Street"), "street");
  assert.equal(placeIconFor(null, "Acorn Street"), "street");
  assert.equal(placeIconFor(null, "Davis Square"), "street");
  assert.equal(placeIconFor(null, "South End dinner"), "restaurant");
  assert.equal(placeIconFor(null, "Harvard Square coffee"), "cafe");
  assert.equal(placeIconFor(null, "Newbury Street galleries"), "museum");
  assert.equal(placeIconFor(null, "Charles River Esplanade"), "park");
  assert.equal(placeIconFor(null, "Long Wharf"), "water");
  assert.equal(placeIconFor("intersection", "Seaport Harborwalk"), "water", "vague Google type: use the name");
  assert.equal(placeIconFor("sports_school", "Piers Park"), "park");
  assert.equal(placeIconFor("local_government_office", "Massachusetts State House"), "landmark");
  assert.equal(placeIconFor(null, "Somewhere"), "place");
});

test("stop markers: icon with a number badge, plain number without a category, blue check when done", () => {
  const svg = marker => decodeURIComponent(marker.url.split(",")[1]);
  const park = stopMarker(2, { icon: "park" });
  assert.match(svg(park), new RegExp(`fill="${ROUTE_THEME.stop}"`));
  assert.match(svg(park), /<path d="M12 22v-6/, "draws the tree");
  assert.match(svg(park), />2<\/text>/, "keeps the stop number as a badge");
  assert.deepEqual(park.anchor, [13, 20], "anchored at the circle's center, below the badge");
  const plain = stopMarker(3);
  assert.equal(plain.width, 22);
  assert.match(svg(plain), />3<\/text>/);
  assert.equal(stopMarker(3, { selected: true }).width, 28);
  const done = svg(stopMarker(2, { icon: "park", done: true }));
  assert.match(done, new RegExp(`fill="${ROUTE_THEME.line}"`));
  assert.doesNotMatch(done, /<text/);
  assert.equal(stopMarker(2, { icon: "park" }), park, "cached");
});

test("with a walk open, Google's icons are hidden", async () => {
  const { WALK_OPEN_STYLE } = await import("./map-style.mjs");
  assert.ok(WALK_OPEN_STYLE.some(r => !r.featureType && r.elementType === "labels.icon" && r.stylers[0].visibility === "off"));
  assert.ok(WALK_OPEN_STYLE.some(r => r.featureType === "poi.attraction" && r.stylers[0].visibility === "off"));
});

test("exploring hides Google's icons for ours; the fallback shows Google's; area names are ours everywhere", async () => {
  const { EXPLORE_STYLE, EXPLORE_GOOGLE_ICONS_STYLE, WALK_OPEN_STYLE } = await import("./map-style.mjs");
  const hidesAll = style => style.some(r => r.featureType === "poi" && !r.elementType && r.stylers[0].visibility === "off");
  assert.equal(hidesAll(EXPLORE_STYLE), true);
  assert.equal(hidesAll(EXPLORE_GOOGLE_ICONS_STYLE), false);
  assert.ok(!EXPLORE_GOOGLE_ICONS_STYLE.some(r => r.featureType === "poi.park" && r.elementType === "labels.icon"), "park icons show in the fallback");
  for (const style of [EXPLORE_STYLE, EXPLORE_GOOGLE_ICONS_STYLE, WALK_OPEN_STYLE]) {
    assert.ok(style.some(r => r.featureType === "administrative.neighborhood" && r.elementType === "labels" && r.stylers[0].visibility === "off"));
    assert.ok(style.some(r => r.featureType === "road" && r.elementType === "labels" && r.stylers[0].visibility === "off"), "no street names");
    assert.ok(style.some(r => r.featureType === "road" && r.elementType === "geometry.fill"), "still the monochrome map");
  }
});
