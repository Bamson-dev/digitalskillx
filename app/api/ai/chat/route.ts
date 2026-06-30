import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "The AI assistant isn't configured yet. Add ANTHROPIC_API_KEY to enable it. In the meantime, revisit the lesson video and notes, or message your instructor.",
    });
  }

  // Optional lesson context to ground the answer.
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

  let reply = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: SYSTEM_PROMPT + context,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? "AI request failed" },
        { status: 500 },
      );
    }
    reply = json.content?.[0]?.text ?? "Sorry, I couldn't generate a response.";
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 },
    );
  }

  // Persist the conversation (best-effort) with the service-role client.
  try {
    const admin = createAdminClient();
    await admin.from("ai_conversations").insert({
      student_id: user.id,
      lesson_id: body.lessonId ?? null,
      messages: [...messages, { role: "assistant", content: reply }] as unknown as Json,
    });
  } catch {
    // ignore persistence failures
  }

  return NextResponse.json({ reply });
}
