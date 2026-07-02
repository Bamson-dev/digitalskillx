import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";
import { getDeepseekApiKey, getDeepseekModel } from "@/lib/env-deepseek";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Call DeepSeek (OpenAI-compatible) or Anthropic based on configured keys. */
export async function generateAssistantReply(
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<{ reply: string } | { error: string }> {
  try {
    const deepseekKey = await getDeepseekApiKey();
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deepseekKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await getDeepseekModel(),
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return { error: json.error?.message ?? "DeepSeek request failed" };
    }
    const reply = json.choices?.[0]?.message?.content;
    if (!reply) return { error: "DeepSeek returned an empty response." };
    return { reply };
  } catch {
    // fall through to Anthropic / missing-key message
  }

  const anthropicKey = runtimeEnv("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: runtimeEnv("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-latest",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return { error: json.error?.message ?? "Anthropic request failed" };
      }
      const reply = json.content?.[0]?.text;
      if (!reply) return { error: "Anthropic returned an empty response." };
      return { reply };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Anthropic request failed" };
    }
  }

  return {
    error:
      "AI assistant not configured. Save a DeepSeek key under Admin → Settings → Integrations, or set DEEPSEEK_API_KEY in server env.",
  };
}
