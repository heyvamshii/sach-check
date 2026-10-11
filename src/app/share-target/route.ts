/**
 * Normally the service worker (public/sw.js) catches shares before they reach the server.
 * This only runs if it isn't installed yet, e.g. the very first share; we ask the user to try again.
 */
export async function POST(request: Request): Promise<Response> {
  return Response.redirect(new URL("/?shared=retry", request.url), 303);
}

export async function GET(request: Request): Promise<Response> {
  return Response.redirect(new URL("/", request.url), 303);
}
