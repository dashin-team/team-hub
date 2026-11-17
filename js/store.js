import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@hub/config";
import { createDemoStore } from "@hub/demo-store";
import { isCloudConfigured, isServiceRoleKey } from "@hub/metrics";
import { safeSession } from "@hub/safe";

const FORCE_DEMO = "naneun-team-hub-force-demo";

export function forceDemoMode() {
  safeSession.setItem(FORCE_DEMO, "1");
}

export async function openStore() {
  if (safeSession.getItem(FORCE_DEMO) === "1") {
    const store = createDemoStore();
    await store.init();
    return store;
  }
  if (isServiceRoleKey(SUPABASE_ANON_KEY)) {
    return { mode: "blocked" };
  }
  // 示範模式不載入 cloud-store.js，也不會去抓 CDN。
  if (!isCloudConfigured(SUPABASE_URL, SUPABASE_ANON_KEY)) {
    const store = createDemoStore();
    await store.init();
    return store;
  }
  const { createCloudStore } = await import("@hub/cloud-store");
  const store = createCloudStore(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim());
  await store.init();
  return store;
}
