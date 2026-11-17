import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { createDemoStore } from "./demo-store.js";
import { isCloudConfigured, isServiceRoleKey } from "./metrics.js";

const FORCE_DEMO = "naneun-team-hub-force-demo";

export function forceDemoMode() {
  sessionStorage.setItem(FORCE_DEMO, "1");
}

export async function openStore() {
  if (sessionStorage.getItem(FORCE_DEMO) === "1") {
    const store = createDemoStore();
    await store.init();
    return store;
  }
  if (isServiceRoleKey(SUPABASE_ANON_KEY)) {
    return { mode: "blocked" };
  }
  if (!isCloudConfigured(SUPABASE_URL, SUPABASE_ANON_KEY)) {
    const store = createDemoStore();
    await store.init();
    return store;
  }
  const { createCloudStore } = await import("./cloud-store.js");
  const store = createCloudStore(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim());
  await store.init();
  return store;
}
