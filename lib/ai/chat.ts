import "server-only";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Call DeepSeek (OpenAI-compatible) or Anthropic based on configured keys. */
export async function generateAssistantReply(
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<{ reply: string } | { error: string }> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (deepseekKey) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deepseekKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
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
    } catch (err) {
      return { error: err instanceof Error ? err.message : "DeepSeek request failed" };
    }
  }

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
          model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
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
      "AI assistant not configured. Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env.local.",
  };
}
