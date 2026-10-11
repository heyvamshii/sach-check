// Service worker: receives things shared to the installed app (Android Share menu),
// keeps them in a cache for a moment, and opens the checker page, which picks them up.
const SHARE_CACHE = "sach-share";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function receiveShare(request) {
  const form = await request.formData();
  const text = ["title", "text", "url"]
    .map((key) => form.get(key))
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
  const file = form.get("media");
  const cache = await caches.open(SHARE_CACHE);
  await cache.put("/shared/text", new Response(text));
  if (file && typeof file !== "string") {
    await cache.put("/shared/file", new Response(file, { headers: { "content-type": file.type || "image/jpeg" } }));
  } else {
    await cache.delete("/shared/file");
  }
  return Response.redirect("/?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(event.request).catch(() => Response.redirect("/?shared=failed", 303)));
  }
});
