export function coursePublishRetryDelayMs(attempt: number) {
  return Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.max(0, Math.min(attempt - 1, 11)));
}

export function coursePublishIdempotencyKey(courseId: string, studentId: string) {
  return `course-publish:${courseId}:${studentId}`;
}
