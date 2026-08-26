import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { isUuid } from "@/lib/learn-certificate-shared";
import {
  createLearnDeviceKey,
  LEARN_DEVICE_COOKIE,
  mapLessonNumbersToIds,
  readLearnDeviceKeyFromCookieStore,
  upsertLearnProgress,
  loadLearnProgressSummary,
} from "@/lib/learn-progress";

export async function POST(request: Request) {
  try {
    await bootstrapRuntimeSecrets();
    const body = (await request.json().catch(() => null)) as {
      learningPathId?: string;
      lessonNumber?: string | number;
      lessonNumbers?: Array<string | number>;
      completed?: boolean;
    } | null;

    const pathId = body?.learningPathId?.trim() ?? "";
    if (!isUuid(pathId)) {
      return NextResponse.json({ error: "Invalid learning path." }, { status: 400 });
    }

    const numbers = [
      ...(body?.lessonNumber != null ? [String(body.lessonNumber)] : []),
      ...((body?.lessonNumbers ?? []).map(String)),
    ].filter(Boolean);
    if (!numbers.length) {
      return NextResponse.json({ error: "Lesson number required." }, { status: 400 });
    }

    const completed = body?.completed !== false;
    const session = createClient();
    const admin = await createAdminClientAsync(session);
    const {
      data: { user },
    } = await session.auth.getUser();

    let deviceKey = readLearnDeviceKeyFromCookieStore();
    let setCookie = false;
    if (!user?.id && !deviceKey) {
      deviceKey = createLearnDeviceKey();
      setCookie = true;
    }

    const lessonIds = await mapLessonNumbersToIds(admin, pathId, numbers);
    if (!lessonIds.length) {
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    await upsertLearnProgress({
      admin,
      pathId,
      lessonIds,
      studentId: user?.id ?? null,
      deviceKey: user?.id ? null : deviceKey,
      completed,
    });

    const summary = await loadLearnProgressSummary({
      admin,
      pathId,
      studentId: user?.id ?? null,
      deviceKey: user?.id ? null : deviceKey,
    });

    const response = NextResponse.json({ ok: true, summary });
    if (setCookie && deviceKey) {
      response.cookies.set(LEARN_DEVICE_COOKIE, deviceKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 400,
      });
    }
    return response;
  } catch (err) {
    console.error("[learn-progress]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Progress sync failed." },
      { status: 500 },
    );
  }
}
