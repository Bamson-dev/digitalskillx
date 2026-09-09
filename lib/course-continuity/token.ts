import { signPayload, verifySignedToken } from "@/lib/course-continuity/crypto";

export const COURSE_CONTINUITY_COOKIE = "dsx_course_continuity";
/** Keep students signed-in for classroom continuity across Auth blips. */
export const COURSE_CONTINUITY_MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type CourseContinuityPayload = {
  v: 1;
  sub: string;
  email: string;
  name: string;
  role: "student" | "admin";
  courses: string[];
  exp: number;
};

export function isClassroomContinuityPath(pathname: string): boolean {
  return (
    pathname.startsWith("/courses") ||
    pathname.startsWith("/lessons") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/my-learning") ||
    pathname.startsWith("/continue") ||
    pathname.startsWith("/certificates") ||
    pathname.startsWith("/quizzes") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/support")
  );
}

export async function createContinuityToken(
  input: Omit<CourseContinuityPayload, "v" | "exp"> & { maxAgeSec?: number },
): Promise<string> {
  const maxAge = input.maxAgeSec ?? COURSE_CONTINUITY_MAX_AGE_SEC;
  const payload: CourseContinuityPayload = {
    v: 1,
    sub: input.sub,
    email: input.email.trim().toLowerCase(),
    name: input.name || input.email,
    role: input.role,
    courses: Array.from(new Set(input.courses.filter(Boolean))).slice(0, 40),
    exp: Math.floor(Date.now() / 1000) + maxAge,
  };
  return signPayload(JSON.stringify(payload));
}

export async function readContinuityPayload(
  token: string | undefined | null,
): Promise<CourseContinuityPayload | null> {
  if (!token) return null;
  const json = await verifySignedToken(token);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as CourseContinuityPayload;
    if (parsed?.v !== 1 || !parsed.sub || !parsed.email || !parsed.exp) return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    if (parsed.role !== "student" && parsed.role !== "admin") return null;
    return {
      ...parsed,
      courses: Array.isArray(parsed.courses) ? parsed.courses.filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

export function continuityCookieOptions(maxAge = COURSE_CONTINUITY_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
