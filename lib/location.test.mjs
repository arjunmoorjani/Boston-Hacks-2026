import assert from "node:assert/strict";
import test from "node:test";
import { locationWatchOptions, watchUserLocation } from "./location.mjs";

function fakeGeolocation() {
  const state = { cleared: [], success: null, failure: null, options: null };
  return {
    state,
    watchPosition(success, failure, options) {
      Object.assign(state, { success, failure, options });
      return 42;
    },
    clearWatch(id) {
      state.cleared.push(id);
    },
  };
}

test("streams coordinates with high-accuracy watch options", () => {
  const geolocation = fakeGeolocation();
  const locations = [];
  const stop = watchUserLocation(geolocation, {
    onLocation: location => locations.push(location),
    onError: assert.fail,
  });

  assert.deepEqual(geolocation.state.options, locationWatchOptions);
  geolocation.state.success({ coords: { latitude: 42.3601, longitude: -71.0589 } });
  assert.deepEqual(locations, [[42.3601, -71.0589]]);

  stop();
  assert.deepEqual(geolocation.state.cleared, [42]);
});

test("reports permission denial without throwing", () => {
  const geolocation = fakeGeolocation();
  const errors = [];
  watchUserLocation(geolocation, {
    onLocation: assert.fail,
    onError: error => errors.push(error),
  });

  geolocation.state.failure({ code: 1 });
  assert.deepEqual(errors, ["Allow location access to see yourself on the map."]);
});

test("rejects invalid coordinate updates", () => {
  const geolocation = fakeGeolocation();
  const errors = [];
  watchUserLocation(geolocation, {
    onLocation: assert.fail,
    onError: error => errors.push(error),
  });

  geolocation.state.success({ coords: { latitude: null, longitude: undefined } });
  assert.deepEqual(errors, ["Couldn’t get your location. Try again."]);
});
