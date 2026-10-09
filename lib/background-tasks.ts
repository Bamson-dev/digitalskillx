import "server-only";

/**
 * Starts best-effort work after a response. Durable work must first be recorded
 * in its existing database queue/outbox; scheduled drain routes recover pending
 * rows after a process restart. Unlike Vercel waitUntil this has no platform API.
 */
export function runBackgroundTask(task: Promise<unknown>, label: string): void {
  void task.catch((error: unknown) => {
    console.error(`[background-task] ${label} failed`, error instanceof Error ? error.name : "unknown error");
  });
}
