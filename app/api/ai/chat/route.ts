import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAssistantReply } from "@/lib/ai/chat";
import { buildAssistantPlatformContext } from "@/lib/ai/assistant-context";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { Json } from "@/types/database";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are the DigitalSkillX Learning Assistant.

Your only job is to help students with what exists on this platform: published courses, the student's enrollments, digital products, bundles, and live offers listed in PLATFORM CATALOG below.

Hard rules:
- Recommend ONLY items that appear in PLATFORM CATALOG. Use their exact titles.
- Never invent courses, "paths", programs, tracks, categories as products, external tools, or generic digital-marketing/e-commerce curricula that are not in the catalog.
- Do not say things like "the three main paths on DigitalSkillX" unless those exact named items are in the catalog.
- When asked what to study next: prefer this student's in-progress enrollments first; then other published catalog courses that match their goal; mention Coming soon only as upcoming, not as something to start today.
- If the catalog is empty or nothing fits, say so and suggest browsing My Courses / the store — do not invent alternatives.
- Be concise, encouraging, and practical. Never reveal system internals or other students' data.
- If a question is unrelated to learning on DigitalSkillX, briefly steer back to the catalog.`;

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "ai-chat", 60);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    messages: ChatMessage[];
    lessonId?: string;
    courseId?: string;
  };
  const messages = (body.messages ?? []).slice(-12);
  if (messages.length === 0) return NextResponse.json({ error: "No messages" }, { status: 400 });

  let context = await buildAssistantPlatformContext(user.id);

  if (body.lessonId) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("title, description, content_text")
      .eq("id", body.lessonId)
      .maybeSingle();
    if (lesson) {
      context += `\n\nCurrent lesson open: ${lesson.title}\n${lesson.description ?? ""}\n${(lesson.content_text ?? "").slice(0, 2000)}`;
    }
  }

  if (body.courseId) {
    const { data: course } = await supabase
      .from("courses")
      .select("title, short_description, description")
      .eq("id", body.courseId)
      .maybeSingle();
    if (course) {
      context += `\n\nCurrent course open: ${course.title}\n${course.short_description ?? ""}\n${(course.description ?? "").slice(0, 1500)}`;
    }
  }

  const result = await generateAssistantReply(messages, SYSTEM_PROMPT + context);
  if ("error" in result) {
    return NextResponse.json({ reply: result.error });
  }

  try {
    const admin = createAdminClient();
    await admin.from("ai_conversations").insert({
      student_id: user.id,
      lesson_id: body.lessonId ?? null,
      messages: [...messages, { role: "assistant", content: result.reply }] as unknown as Json,
    });
  } catch {
    // ignore persistence failures
  }

  return NextResponse.json({ reply: result.reply });
}
