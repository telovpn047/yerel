/* Yerel Messenger service worker */
const VERSION = "yerel-v4";
const SHELL = ["/", "/app.js", "/style.css", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "yerel-share").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function handleShare(req) {
  try {
    const fd = await req.formData();
    const cache = await caches.open("yerel-share");
    for (const k of await cache.keys()) await cache.delete(k);
    const files = [];
    let i = 0;
    for (const f of fd.getAll("files")) {
      if (!f || typeof f === "string") continue;
      const key = "/__share/f" + i++;
      await cache.put(key, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }));
      files.push({ key, name: f.name || "dosya", type: f.type || "", size: f.size });
    }
    const text = [fd.get("title"), fd.get("text"), fd.get("url")].filter((x) => x && typeof x === "string").join("\n");
    await cache.put("/__share/meta", new Response(JSON.stringify({ files, text }), { headers: { "content-type": "application/json" } }));
  } catch (_) {}
  return Response.redirect("/?share=1", 303);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method === "POST" && url.pathname === "/share-target") {
    e.respondWith(handleShare(e.request));
    return;
  }
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/f/") || url.pathname === "/ws") return;
  const isShell = e.request.mode === "navigate" || SHELL.includes(url.pathname) || url.pathname.startsWith("/icons/");
  if (!isShell) return;
  // Önce ağ (güncel sürüm), ağ yoksa önbellek
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request.mode === "navigate" ? "/" : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === "navigate" ? "/" : e.request))
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const chatId = e.notification.data && e.notification.data.chatId;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        await c.focus();
        if (chatId) c.postMessage({ openChat: chatId });
        return;
      }
    }
    await self.clients.openWindow(chatId ? "/?chat=" + encodeURIComponent(chatId) : "/");
  })());
});
