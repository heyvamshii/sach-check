"use client";

/** Picks up whatever the service worker stored when something was shared to the app. */

const SHARE_CACHE = "sach-share";

export interface SharedItem {
  text: string;
  file: Blob | null;
}

export async function takeSharedItem(): Promise<SharedItem | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SHARE_CACHE);
  const [textResponse, fileResponse] = await Promise.all([cache.match("/shared/text"), cache.match("/shared/file")]);
  if (!textResponse && !fileResponse) return null;
  const item: SharedItem = {
    text: textResponse ? await textResponse.text() : "",
    file: fileResponse ? await fileResponse.blob() : null,
  };
  await Promise.all([cache.delete("/shared/text"), cache.delete("/shared/file")]);
  return item;
}

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
