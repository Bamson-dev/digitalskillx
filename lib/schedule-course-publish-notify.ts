import "server-only";
import { waitUntil } from "@vercel/functions";
import { resolveCronContinuationOrigin } from "@/lib/bulk-import-continue";
import { siteUrl } from "@/lib/org";

/**
 * Kick a separate Vercel function to send publish notifications.
 * That route awaits Resend delivery (maxDuration 120) so emails actually go out.
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

  waitUntil(
    fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: "no-store",
      redirect: "error",
    })
      .then(async (res) => {
        const body = await res.text();
        console.info(
          `[course-program-notify] kick ${params.courseId} status=${res.status} body=${body.slice(0, 500)}`,
        );
      })
      .catch((err) => {
        console.error("[course-program-notify] kick failed:", err);
      }),
  );

  return true;
}
