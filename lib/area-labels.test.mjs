import test from "node:test";
import assert from "node:assert/strict";

import { areaLevel } from "./area-labels.mjs";

test("neighborhood labels give way to detailed map labels at zoom 15", () => {
  assert.deepEqual(areaLevel(14), { city: false, hood: true });
  assert.deepEqual(areaLevel(15), { city: false, hood: false });
});
