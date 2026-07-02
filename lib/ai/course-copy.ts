import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";
import {
  COURSE_COPY_SYSTEM_PROMPT,
  type CourseCopyField,
  type CourseCopyInput,
  type CourseCopyResult,
} from "@/lib/ai/course-copy-shared";

export type { CourseCopyField, CourseCopyInput, CourseCopyResult } from "@/lib/ai/course-copy-shared";

function fieldInstruction(field: CourseCopyField): string {
  switch (field) {
    case "short_description":
      return "Generate only short_description (1–2 punchy sentences). Set description to empty string and learning_outcomes to an empty array.";
    case "description":
      return "Generate only description (full sales page body). Set short_description to empty string and learning_outcomes to an empty array.";
    case "learning_outcomes":
      return "Generate only learning_outcomes (5–8 action-verb outcomes). Set short_description and description to empty strings.";
    case "all":
      return "Generate all three fields: short_description, description, and learning_outcomes (5–8 items).";
  }
}

function buildUserPrompt(input: CourseCopyInput, field: CourseCopyField): string {
  const lines = [
    `Course title: ${input.title.trim()}`,
    fieldInstruction(field),
  ];

  if (input.shortDescription?.trim()) {
    lines.push(`Existing short description: ${input.shortDescription.trim()}`);
  }
  if (input.description?.trim()) {
    lines.push(`Existing full description: ${input.description.trim()}`);
  }
  if (input.learningOutcomes?.trim()) {
    lines.push(`Existing learning outcomes:\n${input.learningOutcomes.trim()}`);
  }

  lines.push(
    "Use the title and any existing copy as context. Improve or replace empty fields as needed.",
  );

  return lines.join("\n\n");
}

export function parseCourseCopyResponse(raw: string): CourseCopyResult | null {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text) as {
      short_description?: unknown;
      description?: unknown;
      learning_outcomes?: unknown;
    };

    const outcomes = normalizeOutcomes(parsed.learning_outcomes);

    return {
      short_description:
        typeof parsed.short_description === "string" ? parsed.short_description.trim() : "",
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
      learning_outcomes: outcomes,
    };
  } catch {
    return null;
  }
}

function normalizeOutcomes(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function pickField(result: CourseCopyResult, field: CourseCopyField): CourseCopyResult {
  if (field === "all") return result;
  return {
    short_description: field === "short_description" ? result.short_description : "",
    description: field === "description" ? result.description : "",
    learning_outcomes: field === "learning_outcomes" ? result.learning_outcomes : "",
  };
}

function validateResult(result: CourseCopyResult, field: CourseCopyField): string | null {
  if (field === "all" || field === "short_description") {
    if (!result.short_description) return "AI did not return a short description.";
  }
  if (field === "all" || field === "description") {
    if (!result.description) return "AI did not return a full description.";
  }
  if (field === "all" || field === "learning_outcomes") {
    if (!result.learning_outcomes) return "AI did not return learning outcomes.";
  }
  return null;
}

export async function generateCourseCopy(
  input: CourseCopyInput,
  field: CourseCopyField,
): Promise<{ data: CourseCopyResult } | { error: string }> {
  const apiKey = runtimeEnv("DEEPSEEK_API_KEY");
  if (!apiKey?.trim()) {
    return {
      error:
        "DEEPSEEK_API_KEY is not configured. Add it to your server environment variables and redeploy.",
    };
  }

  const title = input.title.trim();
  if (!title) {
    return { error: "Enter a course title before generating copy." };
  }

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: runtimeEnv("DEEPSEEK_MODEL") ?? "deepseek-chat",
        max_tokens: 2048,
        temperature: 0.7,
        messages: [
          { role: "system", content: COURSE_COPY_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input, field) },
        ],
      }),
    });

    const json = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      return { error: json.error?.message ?? "DeepSeek request failed." };
    }

    const content = json.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      return { error: "DeepSeek returned an empty response." };
    }

    const parsed = parseCourseCopyResponse(content);
    if (!parsed) {
      return {
        error: "Could not parse AI response. Try again — your existing field values were kept.",
      };
    }

    const picked = pickField(parsed, field);
    const validationError = validateResult(picked, field);
    if (validationError) return { error: validationError };

    return { data: picked };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "DeepSeek request failed.",
    };
  }
}
