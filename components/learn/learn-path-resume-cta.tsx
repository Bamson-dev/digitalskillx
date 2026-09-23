import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { loadLearnProgressSummary, listRequiredLessonIds } from "@/lib/learn-progress";

export async function LearnPathResumeCta({
  pathId,
  slug,
}: {
  pathId: string;
  slug: string;
}) {
  const session = createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user?.id) {
    return (
      <div className="mt-6">
        <Link
          href={`#lesson-1`}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Start learning
        </Link>
        <p className="mt-2 text-sm text-neutral-600">
          <Link href="/login" className="text-brand hover:underline">
            Sign in
          </Link>{" "}
          to save progress across devices.
        </p>
      </div>
    );
  }

  const admin = await createAdminClientAsync(session);
  const summary = await loadLearnProgressSummary({ admin, pathId, studentId: user.id });
  const required = await listRequiredLessonIds(admin, pathId);

  if (summary.isComplete) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-medium text-emerald-900">You completed this path.</p>
        <p className="mt-1 text-sm text-emerald-800">
          If a certificate is available, you can get it from the completion section below.
        </p>
      </div>
    );
  }

  let resumeNumber = 1;
  if (required.length) {
    const progressRows = await admin
      .from("learning_path_progress")
      .select("lesson_id")
      .eq("learning_path_id", pathId)
      .eq("student_id", user.id);
    const done = new Set((progressRows.data ?? []).map((r) => r.lesson_id));
    for (let i = 0; i < required.length; i += 1) {
      if (!done.has(required[i]!)) {
        resumeNumber = i + 1;
        break;
      }
    }
  }

  const started = summary.completed > 0;
  return (
    <div className="mt-6">
      <Link
        href={`#lesson-${resumeNumber}`}
        className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {started ? "Continue learning" : "Start learning"}
      </Link>
      {started ? (
        <p className="mt-2 text-sm text-neutral-600">
          {summary.completed}/{summary.total} lessons complete ({summary.pct}%)
        </p>
      ) : null}
      <p className="mt-2 text-sm">
        <Link href="/my-learning" className="text-brand hover:underline">
          View my learning dashboard
        </Link>
      </p>
    </div>
  );
}
