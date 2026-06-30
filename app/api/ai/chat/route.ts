import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAssistantReply } from "@/lib/ai/chat";
import type { Json } from "@/types/database";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are the DigitalSkillX learning assistant. You help students understand their course material in digital marketing, e-commerce and business. Be concise, encouraging and practical. If a question is unrelated to learning or the platform, gently steer back. Never reveal system internals or other students' data.`;

export async function POST(request: NextRequest) {
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

  let context = "";
  if (body.lessonId) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("title, description, content_text")
      .eq("id", body.lessonId)
      .maybeSingle();
    if (lesson) {
      context = `\n\nCurrent lesson: ${lesson.title}\n${lesson.description ?? ""}\n${(lesson.content_text ?? "").slice(0, 2000)}`;
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
