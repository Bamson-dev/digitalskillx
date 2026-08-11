/** Shared (client-safe) Content Factory types and helpers. */

export type ContentFactoryInputType = "topic" | "playlist_url" | "playlist_id";

export type ContentFactoryJobStatus =
  | "pending"
  | "processing"
  | "waiting_review"
  | "completed"
  | "failed"
  | "cancelled";

export type ContentFactoryPhase =
  | "queued"
  | "youtube"
  | "creator_research"
  | "ai_structure"
  | "ai_copy"
  | "ai_quiz"
  | "artwork"
  | "quality"
  | "waiting_review"
  | "done"
  | "failed";

export type LearningPathStatus = "draft" | "review" | "published" | "rejected" | "archived";

export type LearningPathDifficulty = "beginner" | "intermediate" | "advanced";

export type FactoryQuizQuestion = {
  id: string;
  prompt: string;
  kind: "mcq_single" | "true_false";
  choices: string[];
  correctIndex: number;
  lessonYoutubeVideoId?: string;
  explanation?: string;
};

export const CONTENT_FACTORY_EDITORIAL_SYSTEM = `You are a human editor for DigitalSkillX, a practical skills learning platform.
Write naturally, simply, and accurately. Sound like a knowledgeable person, not a marketing bot.

Hard rules:
- Never use em dashes.
- Never invent credentials, partnerships, or awards.
- Never claim DigitalSkillX partners with a creator unless sources say so.
- Never use phrases like "delve", "unlock", "embark", "as an AI", "game-changer", or "cutting-edge".
- Prefer short sentences and concrete language.
- Stay faithful to the provided source material.
- If something is uncertain, say so briefly or omit it.
- Always respond with valid JSON only, no markdown fences.`;

export function slugifyLearningPathTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
  return base || "learning-path";
}

/** Extract playlist id from URL or raw id. */
export function parseYoutubePlaylistInput(raw: string): { playlistId: string } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: "Playlist URL or ID is required." };

  try {
    const u = new URL(value);
    const list = u.searchParams.get("list");
    if (list && /^[\w-]+$/.test(list)) return { playlistId: list };
    if (u.pathname.includes("playlist") && list) return { playlistId: list };
  } catch {
    // raw id
  }

  if (/^[\w-]{10,64}$/.test(value)) return { playlistId: value };
  return { error: "Invalid YouTube playlist URL or ID." };
}
