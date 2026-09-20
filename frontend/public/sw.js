importScripts("/assets/pwa-precache.js");

const release = self.__PWA_PRECACHE;
const cacheName = `aaf-shell-${release.buildId}`;
const required = new Set(release.assets);

async function clientRelease(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.buildId ?? null);
    };
    client.postMessage({ type: "PWA_RELEASE_QUERY" }, [channel.port2]);
  });
}

async function cleanUnusedReleases() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const versions = await Promise.all(clients.map(clientRelease));
  if (versions.some((version) => version !== release.buildId)) return;
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("aaf-shell-") && name !== cacheName)
    .map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      const responses = await Promise.all(release.assets.map(async (path) => {
        const response = await fetch(path, { cache: "reload", credentials: "omit", redirect: "error" });
        if (!response.ok || response.type !== "basic" ||
            (path === "/app" && !response.headers.get("content-type")?.includes("text/html"))) {
          throw new Error(`Required PWA asset failed: ${path}`);
        }
        return response;
      }));
      await Promise.all(release.assets.map((path, index) => cache.put(path, responses[index])));
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
    // The first installation activates normally. Updates wait for the user's choice.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim().then(cleanUnusedReleases));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_READY") {
    event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      const ready = !!(await cache.match("/app"));
      event.ports[0]?.postMessage({ type: "PWA_READY", ready, buildId: release.buildId });
      await cleanUnusedReleases();
    })());
  }
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname === "/app" && !url.search) {
      event.respondWith(caches.open(cacheName).then((cache) => cache.match("/app")));
    } else if (!url.search && (url.pathname === "/" ||
        ["/plan", "/shop", "/pantry", "/import"].includes(url.pathname) ||
        /^\/cookbook(?:\/|$)/.test(url.pathname))) {
      const localPath = url.pathname === "/" ? "/plan" : url.pathname;
      event.respondWith(Response.redirect(new URL(`/app#${localPath}`, url.origin), 302));
    }
    return;
  }

  if (url.search || url.pathname === "/app") return;
  if (required.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then((cache) => cache.match(url.pathname)));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith("aaf-shell-")) continue;
        const cached = await (await caches.open(name)).match(url.pathname);
        if (cached) return cached;
      }
      return fetch(request);
    })());
  }
});
