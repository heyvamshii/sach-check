/**
 * Small fixed-window rate limiter kept in memory. On Vercel each server
 * instance has its own memory, so this is a best-effort guard that stops a
 * single visitor from using up the free API quotas — not a hard limit.
 */

const MAX_TRACKED_CLIENTS = 5000;

interface Window {
  start: number;
  count: number;
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, Window>();

  function check(key: string, now = Date.now()): boolean {
    const current = windows.get(key);
    if (!current || now - current.start >= windowMs) {
      if (windows.size >= MAX_TRACKED_CLIENTS) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    windows.set(key, { start: current.start, count: current.count + 1 });
    return true;
  }

  return { check };
}
