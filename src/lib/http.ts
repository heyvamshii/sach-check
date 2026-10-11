import type { ApiResponse } from "./types";

/** Small helpers so every API route answers in the same { success, data, error } shape. */

export function ok<T>(data: T, init?: ResponseInit): Response {
  const body: ApiResponse<T> = { success: true, data, error: null };
  return Response.json(body, init);
}

export function fail(status: number, error: string): Response {
  const body: ApiResponse<never> = { success: false, data: null, error };
  return Response.json(body, { status });
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
