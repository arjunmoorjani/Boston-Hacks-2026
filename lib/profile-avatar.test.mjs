import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROFILE_AVATARS,
  isPresetAvatar,
  presetAvatarPath,
  presetAvatarSource,
  validateProfileAvatar,
} from "./profile-avatar.mjs";

test("every default profile picture has a stable preset path and local asset", () => {
  assert.equal(DEFAULT_PROFILE_AVATARS.length, 7);
  for (const avatar of DEFAULT_PROFILE_AVATARS) {
    const path = presetAvatarPath(avatar.id);
    assert.equal(isPresetAvatar(path), true);
    assert.equal(presetAvatarSource(path), avatar.src);
    assert.match(avatar.src, /^\/profile-avatars\/.*\.png$/);
  }
});

test("profile uploads must be images no larger than five megabytes", () => {
  assert.doesNotThrow(() => validateProfileAvatar({ type: "image/png", size: 1024 }));
  assert.throws(() => validateProfileAvatar({ type: "text/plain", size: 12 }), /image file/);
  assert.throws(() => validateProfileAvatar({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /smaller than 5 MB/);
});
