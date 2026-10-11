/** Reject if `work` takes longer than `ms`, so serverless functions answer before the platform kills them. */

export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`timed out after ${Math.round(ms / 1000)} s`);
  }
}

export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Vercel stops functions at maxDuration (60 s); leave room to send a reply
export const CHECK_DEADLINE_MS = 50_000;
