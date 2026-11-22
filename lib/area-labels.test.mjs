import test from "node:test";
import assert from "node:assert/strict";

import { areaLevel } from "./area-labels.mjs";

test("neighborhood labels give way to detailed map labels at zoom 15", () => {
  assert.deepEqual(areaLevel(14), { city: false, hood: true, feature: true });
  assert.deepEqual(areaLevel(15), { city: false, hood: false, feature: true });
});

test("water and natural-feature names show from zoom 13", () => {
  assert.equal(areaLevel(12).feature, false);
  assert.equal(areaLevel(13).feature, true);
});
