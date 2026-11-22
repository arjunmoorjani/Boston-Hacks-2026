export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;

export const DEFAULT_PROFILE_AVATARS = Object.freeze([
  { id: "swan-boats", label: "Swan Boats", src: "/profile-avatars/swan-boats.png" },
  { id: "citgo-sign", label: "Citgo sign", src: "/profile-avatars/citgo-sign.png" },
  { id: "sailboat", label: "Sailboat", src: "/profile-avatars/sailboat.png" },
  { id: "red-sox-cap", label: "Red Sox cap", src: "/profile-avatars/red-sox-cap.png" },
  { id: "lobster-roll", label: "Lobster roll", src: "/profile-avatars/lobster-roll.png" },
  { id: "boston-finish", label: "Boston finish line", src: "/profile-avatars/boston-finish.png" },
  { id: "celtics-player", label: "Celtics player", src: "/profile-avatars/celtics-player.png" },
]);

const presets = new Map(DEFAULT_PROFILE_AVATARS.map(avatar => [`preset:${avatar.id}`, avatar]));

export function presetAvatarPath(id) {
  return `preset:${id}`;
}

export function presetAvatarSource(path) {
  return presets.get(path)?.src ?? null;
}

export function isPresetAvatar(path) {
  return presets.has(path);
}

export function validateProfileAvatar(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > MAX_PROFILE_AVATAR_BYTES) throw new Error("Choose an image smaller than 5 MB.");
}

const safeFileName = name => String(name || "avatar.jpg")
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "avatar.jpg";

export async function resolveProfileAvatar(client, path) {
  if (!path) return null;
  const preset = presetAvatarSource(path);
  if (preset) return preset;
  const { data, error } = await client.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function saveAccountProfile({ client, userId, name, avatarPath, avatarFile, previousAvatarPath }) {
  let nextAvatarPath = avatarPath || null;
  let uploadedPath = null;

  if (avatarFile) {
    validateProfileAvatar(avatarFile);
    uploadedPath = `${userId}/${crypto.randomUUID()}-${safeFileName(avatarFile.name)}`;
    const { error: uploadError } = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(uploadedPath, avatarFile, {
      contentType: avatarFile.type || "image/jpeg",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    nextAvatarPath = uploadedPath;
  }

  const { data, error } = await client.from("profiles").update({
    display_name: name,
    avatar_path: nextAvatarPath,
  }).eq("id", userId).select("display_name, avatar_path").single();

  if (error) {
    if (uploadedPath) await client.storage.from(PROFILE_AVATAR_BUCKET).remove([uploadedPath]);
    throw error;
  }

  if (previousAvatarPath && previousAvatarPath !== data.avatar_path && !isPresetAvatar(previousAvatarPath)) {
    await client.storage.from(PROFILE_AVATAR_BUCKET).remove([previousAvatarPath]);
  }

  return {
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    avatarUrl: await resolveProfileAvatar(client, data.avatar_path),
  };
}
