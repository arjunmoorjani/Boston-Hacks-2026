import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRoutePayload } from "./routes.mjs";
import { activeChips, anyActive, applyFilters, categoryCounts, emptyFilters, toggleOption } from "./route-filters.mjs";

const walks = normalizeRoutePayload(JSON.parse(await readFile(new URL("../public/routes.json", import.meta.url), "utf8")));
const ids = list => list.map(walk => walk.id);

test("no filters shows every walk", () => {
  assert.equal(applyFilters(walks, emptyFilters).length, walks.length);
  assert.equal(anyActive(emptyFilters), false);
});

test("options in one group widen, groups together narrow", () => {
  const food = applyFilters(walks, { ...emptyFilters, categories: ["Food"] });
  const foodOrCulture = applyFilters(walks, { ...emptyFilters, categories: ["Food", "Culture"] });
  const freeFood = applyFilters(walks, { ...emptyFilters, categories: ["Food"], cost: ["free"] });
  assert.ok(food.length > 0 && foodOrCulture.length > food.length);
  assert.ok(freeFood.length < food.length);
  assert.ok(freeFood.every(walk => walk.category === "Food" && walk.cost === "free"));
});

test("T line filter matches every Green branch", () => {
  const green = applyFilters(walks, { ...emptyFilters, line: ["Green"] });
  assert.ok(green.length > 0);
  assert.ok(green.every(walk => walk.tLines.some(id => id.startsWith("Green"))));
});

test("search looks at titles, neighborhoods and stop names", () => {
  assert.ok(ids(applyFilters(walks, { ...emptyFilters, query: "cannoli" })).includes("cannoli-showdown"));
  assert.ok(ids(applyFilters(walks, { ...emptyFilters, query: "mike's pastry" })).includes("cannoli-showdown"), "matches a stop name");
  assert.ok(ids(applyFilters(walks, { ...emptyFilters, query: "north end" })).length >= 2);
  assert.equal(applyFilters(walks, { ...emptyFilters, query: "zzzz" }).length, 0);
});

test("time buckets split by duration", () => {
  const short = applyFilters(walks, { ...emptyFilters, time: ["short"] });
  const long = applyFilters(walks, { ...emptyFilters, time: ["long"] });
  assert.ok(short.every(walk => walk.durationMin < 90));
  assert.ok(long.every(walk => walk.durationMin > 150));
});

test("category counts ignore the category choice but respect other filters", () => {
  const filters = { ...emptyFilters, categories: ["Food"], cost: ["free"] };
  const counts = categoryCounts(walks, filters);
  assert.equal(counts.Food, applyFilters(walks, filters).length);
  assert.equal(counts.Culture, applyFilters(walks, { ...filters, categories: ["Culture"] }).length);
});

test("toggling and chips", () => {
  let filters = toggleOption(emptyFilters, "with", "Date");
  filters = toggleOption(filters, "cost", "free");
  assert.deepEqual(activeChips(filters).map(chip => chip.label), ["Date", "Free"]);
  filters = toggleOption(filters, "with", "Date");
  assert.deepEqual(filters.with, []);
});
