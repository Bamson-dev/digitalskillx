import "server-only";
import { runBackgroundTask } from "@/lib/background-tasks";
import { resolveCronContinuationOrigin } from "@/lib/bulk-import-continue";
import { siteUrl } from "@/lib/org";

/**
 * Kick the application notification route; pending notification state remains
 * in the database and scheduled drains recover work after process restarts.
 */
export function scheduleCoursePublishNotify(params: {
  courseId: string;
  forceResend?: boolean;
}) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[course-program-notify] CRON_SECRET missing — cannot kick notify worker");
    return false;
  }

  const origin = resolveCronContinuationOrigin(siteUrl());
  const url = new URL(`/api/admin/courses/${params.courseId}/notify-publish`, origin);
  if (params.forceResend) url.searchParams.set("force", "1");

  runBackgroundTask(
    fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
      redirect: "error",
    })
      .then((res) => console.info(`[course-program-notify] kick ${params.courseId} status=${res.status}`)),
    "course-program-notify",
  );

  return true;
}
