const currentOrigin = "https://scene.benlear439.workers.dev";
const origins = new Set([
  currentOrigin,
  "https://scene.leardigital.workers.dev",
  "https://scene-streaming.airyokapi2.chatgpt.site",
  "https://scene-streaming.magiclettuce.chatgpt.site",
]);

export function isSceneOrigin(value: string | null): value is string {
  return value !== null && origins.has(value);
}

// The Worker passes its validated public origin. This keeps invitation links
// correct on either side of the account-subdomain rename.
export function sceneInvitationOrigin(value: string | null) {
  return isSceneOrigin(value) ? value : currentOrigin;
}
