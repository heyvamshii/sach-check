import type { FetchLike } from "./groq";

/** Test helper: a fake `fetch` that answers from a list of handlers, in order of matching. */

export interface FakeRoute {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
}

export function fakeFetch(routes: FakeRoute[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    const route = routes.find((r) => r.match(url, init));
    if (!route) return new Response("not found", { status: 404 });
    return route.respond(url, init);
  }) as FetchLike & { calls: string[] };
  impl.calls = calls;
  return impl;
}

/** A Groq chat reply carrying `content`. */
export function groqReply(content: unknown): Response {
  return Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });
}

export function bodyOf(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}
