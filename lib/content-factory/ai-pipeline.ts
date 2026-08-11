import "server-only";
import { getDeepseekApiKey, getDeepseekModel } from "@/lib/env-deepseek";
import { CONTENT_FACTORY_EDITORIAL_SYSTEM } from "@/lib/content-factory/shared";
import type { FactoryQuizQuestion } from "@/lib/content-factory/shared";

export type FactoryLessonInput = {
  youtubeVideoId: string;
  title: string;
  description: string;
  position: number;
  durationSeconds: number | null;
};

function extractJsonObject(raw: string): unknown {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

async function deepseekJson(userPrompt: string): Promise<unknown> {
  const apiKey = await getDeepseekApiKey();
  if (!apiKey) {
    throw new Error("DeepSeek API key is not configured.");
  }
  const model = getDeepseekModel();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: CONTENT_FACTORY_EDITORIAL_SYSTEM },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content.");
  try {
    return extractJsonObject(content);
  } catch {
    throw new Error("DeepSeek returned non-JSON content.");
  }
}

export async function generateCreatorProfileCopy(input: {
  channelTitle: string;
  channelDescription: string;
  playlistTitle: string;
  playlistDescription: string;
  extraSourceText?: string;
}): Promise<{
  short_bio: string;
  expertise: string[];
  teaches: string;
  credentials: string;
  relevance: string;
}> {
  const parsed = (await deepseekJson(`Create a source-backed creator profile JSON for a free learning path.

Channel name: ${input.channelTitle}
Channel description:
${input.channelDescription.slice(0, 2500)}

Playlist title: ${input.playlistTitle}
Playlist description:
${input.playlistDescription.slice(0, 1500)}

Extra public source text (may be empty):
${(input.extraSourceText ?? "").slice(0, 3000)}

Return JSON:
{
  "short_bio": "2-4 natural sentences",
  "expertise": ["topic", "..."],
  "teaches": "1-2 sentences on what they teach",
  "credentials": "Only verifiable items from sources, or empty string",
  "relevance": "Why this creator fits the learning path"
}`)) as Record<string, unknown>;

  return {
    short_bio: typeof parsed.short_bio === "string" ? parsed.short_bio.trim() : "",
    expertise: Array.isArray(parsed.expertise)
      ? parsed.expertise.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12)
      : [],
    teaches: typeof parsed.teaches === "string" ? parsed.teaches.trim() : "",
    credentials: typeof parsed.credentials === "string" ? parsed.credentials.trim() : "",
    relevance: typeof parsed.relevance === "string" ? parsed.relevance.trim() : "",
  };
}

export async function generateLearningPathStructure(input: {
  playlistTitle: string;
  playlistDescription: string;
  creatorName: string;
  lessons: FactoryLessonInput[];
}): Promise<{
  title: string;
  short_description: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  learning_objectives: string[];
  sections: Array<{ title: string; lessonVideoIds: string[] }>;
  lesson_summaries: Array<{
    youtubeVideoId: string;
    summary: string;
    learning_objectives: string[];
  }>;
  warnings: string[];
}> {
  const lessonLines = input.lessons
    .slice(0, 60)
    .map(
      (l) =>
        `${l.position + 1}. id=${l.youtubeVideoId} title=${JSON.stringify(l.title)} duration=${l.durationSeconds ?? "?"} desc=${JSON.stringify(l.description.slice(0, 280))}`,
    )
    .join("\n");

  const parsed = (await deepseekJson(`Build a DigitalSkillX free learning path from this YouTube playlist.

Playlist: ${input.playlistTitle}
Playlist description: ${input.playlistDescription.slice(0, 1500)}
Creator: ${input.creatorName}

Lessons (preserve video order; group into sections without reordering videos):
${lessonLines}

Return JSON:
{
  "title": "clear learning path title",
  "short_description": "1-2 sentences",
  "description": "helpful overview, not salesy",
  "category": "short category label",
  "difficulty": "beginner|intermediate|advanced",
  "tags": ["tag"],
  "learning_objectives": ["objective"],
  "sections": [{"title": "Section title", "lessonVideoIds": ["videoId"]}],
  "lesson_summaries": [{"youtubeVideoId": "id", "summary": "2-4 sentences", "learning_objectives": ["..."]}],
  "warnings": ["optional issues for admin review"]
}

Every lesson video id must appear exactly once across sections.`)) as Record<string, unknown>;

  const difficultyRaw = typeof parsed.difficulty === "string" ? parsed.difficulty : "beginner";
  const difficulty =
    difficultyRaw === "intermediate" || difficultyRaw === "advanced" ? difficultyRaw : "beginner";

  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = sectionsRaw
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        title: typeof row.title === "string" ? row.title.trim() : "Section",
        lessonVideoIds: Array.isArray(row.lessonVideoIds)
          ? row.lessonVideoIds.filter((x): x is string => typeof x === "string")
          : [],
      };
    })
    .filter((s) => s.lessonVideoIds.length > 0);

  const summariesRaw = Array.isArray(parsed.lesson_summaries) ? parsed.lesson_summaries : [];
  const lesson_summaries = summariesRaw
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        youtubeVideoId: typeof row.youtubeVideoId === "string" ? row.youtubeVideoId : "",
        summary: typeof row.summary === "string" ? row.summary.trim() : "",
        learning_objectives: Array.isArray(row.learning_objectives)
          ? row.learning_objectives.filter((x): x is string => typeof x === "string").slice(0, 6)
          : [],
      };
    })
    .filter((s) => s.youtubeVideoId);

  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : input.playlistTitle,
    short_description: typeof parsed.short_description === "string" ? parsed.short_description.trim() : "",
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    category: typeof parsed.category === "string" ? parsed.category.trim() : "Skills",
    difficulty,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12)
      : [],
    learning_objectives: Array.isArray(parsed.learning_objectives)
      ? parsed.learning_objectives.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [],
    sections,
    lesson_summaries,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((x): x is string => typeof x === "string").slice(0, 20)
      : [],
  };
}

export async function generateLearningPathQuizzes(input: {
  title: string;
  lessons: Array<{ youtubeVideoId: string; title: string; summary: string }>;
}): Promise<{ quiz: FactoryQuizQuestion[]; assessment: FactoryQuizQuestion[] }> {
  const lessonLines = input.lessons
    .slice(0, 40)
    .map((l) => `- ${l.youtubeVideoId}: ${l.title} :: ${l.summary.slice(0, 240)}`)
    .join("\n");

  const parsed = (await deepseekJson(`Create quiz and final assessment questions for "${input.title}".
Only ask about information present in the lesson summaries.

Lessons:
${lessonLines}

Return JSON:
{
  "quiz": [
    {
      "id": "q1",
      "prompt": "...",
      "kind": "mcq_single",
      "choices": ["A","B","C","D"],
      "correctIndex": 0,
      "lessonYoutubeVideoId": "optional",
      "explanation": "short"
    }
  ],
  "assessment": [ same shape ]
}

Provide 6-10 quiz items and 8-12 assessment items. kind may be mcq_single or true_false (true_false choices must be ["True","False"]).`)) as Record<string, unknown>;

  const normalize = (raw: unknown, prefix: string): FactoryQuizQuestion[] => {
    if (!Array.isArray(raw)) return [];
    const out: FactoryQuizQuestion[] = [];
    raw.forEach((item, i) => {
      const row = item as Record<string, unknown>;
      const kind = row.kind === "true_false" ? "true_false" : "mcq_single";
      const choices = Array.isArray(row.choices)
        ? row.choices.filter((x): x is string => typeof x === "string").slice(0, 6)
        : kind === "true_false"
          ? ["True", "False"]
          : [];
      const correctIndex = typeof row.correctIndex === "number" ? row.correctIndex : 0;
      if (!choices.length || typeof row.prompt !== "string") return;
      out.push({
        id: typeof row.id === "string" ? row.id : `${prefix}${i + 1}`,
        prompt: row.prompt.trim(),
        kind,
        choices,
        correctIndex: Math.max(0, Math.min(choices.length - 1, correctIndex)),
        lessonYoutubeVideoId:
          typeof row.lessonYoutubeVideoId === "string" ? row.lessonYoutubeVideoId : undefined,
        explanation: typeof row.explanation === "string" ? row.explanation.trim() : undefined,
      });
    });
    return out;
  };

  return {
    quiz: normalize(parsed.quiz, "quiz-"),
    assessment: normalize(parsed.assessment, "assess-"),
  };
}

export function scoreLearningPathQuality(input: {
  lessonCount: number;
  hasCreatorBio: boolean;
  hasCreatorSources: boolean;
  hasSummaries: boolean;
  hasObjectives: boolean;
  quizCount: number;
  assessmentCount: number;
  hasArtwork: boolean;
  warningCount: number;
}): { score: number; breakdown: Record<string, number> } {
  const breakdown = {
    content_relevance: input.lessonCount >= 3 ? 18 : input.lessonCount > 0 ? 10 : 0,
    curriculum_structure: input.lessonCount >= 5 ? 16 : 8,
    lesson_completeness: input.hasSummaries ? 14 : 4,
    topic_coverage: input.hasObjectives ? 12 : 4,
    creator_confidence: (input.hasCreatorBio ? 10 : 0) + (input.hasCreatorSources ? 6 : 0),
    assessment_quality: Math.min(14, input.quizCount + input.assessmentCount > 10 ? 14 : (input.quizCount + input.assessmentCount)),
    artwork: input.hasArtwork ? 6 : 0,
    source_completeness: input.hasCreatorSources ? 8 : 2,
  };
  let score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  score = Math.max(0, Math.min(100, score - Math.min(20, input.warningCount * 2)));
  return { score, breakdown };
}
