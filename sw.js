const CACHE = "team-hub-20261118m";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/account.js",
  "./js/calendar.js",
  "./js/car-renewals.js",
  "./js/car-intake.js",
  "./js/car-ocr.js",
  "./js/client-import.js",
  "./js/client-profile.js",
  "./js/cloud-store.js",
  "./js/config.js",
  "./js/contact-log.js",
  "./js/contest.js",
  "./js/demo-store.js",
  "./js/guides.js",
  "./js/metrics.js",
  "./js/quotes.js",
  "./js/safe-browser.js",
  "./js/store.js",
  "./js/team-roster.js",
  "./js/team-schedule.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.ico",
  "./favicon-32.png",
  "./favicon.svg",
  "./assets/logo-daxin.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

function isSupabase(url) {
  return url.hostname.endsWith(".supabase.co") || url.hostname === "supabase.co";
}

function isHtml(request, url) {
  return request.mode === "navigate"
    || (request.headers.get("accept") || "").includes("text/html")
    || url.pathname.endsWith("/")
    || url.pathname.endsWith(".html");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request) || await cache.match("./index.html") || await cache.match("./");
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isSupabase(url) || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  if (isHtml(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (/\.(?:css|js|png|svg|webmanifest|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
