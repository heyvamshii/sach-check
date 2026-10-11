import { serviceStatus } from "@/lib/config";
import { ok } from "@/lib/http";

/** Tells the page which free services are switched on. Never returns the keys themselves. */
export async function GET(): Promise<Response> {
  return ok(serviceStatus());
}
