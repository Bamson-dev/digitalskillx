import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";
import { getStorageService } from "@/lib/storage";
import { siteUrl } from "@/lib/org";
import {
  ARTWORK_RETRY_ATTEMPTS,
  buildLearningPathArtworkPrompt,
  type ArtworkSource,
  type ArtworkStatus,
} from "@/lib/content-factory/artwork-shared";

function openaiKey(): string {
  return (runtimeEnv("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY ?? "").trim();
}

export type LearningPathArtworkResult = {
  storagePath: string | null;
  publicUrl: string | null;
  status: ArtworkStatus;
  source: ArtworkSource | null;
  error: string | null;
};

async function callOpenAiImages(prompt: string): Promise<Buffer> {
  const key = openaiKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI image generation failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data?.[0];
  let bytes: Buffer | null = null;
  if (first?.b64_json) {
    bytes = Buffer.from(first.b64_json, "base64");
  } else if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error("Failed to download generated artwork.");
    bytes = Buffer.from(await img.arrayBuffer());
  }
  if (!bytes) throw new Error("OpenAI returned no image payload.");
  return bytes;
}

/**
 * Generate course artwork via OpenAI Images API and store on Contabo/local StorageService.
 * Retries a small number of times. Does not throw when the API key is missing — returns a failed result.
 */
export async function generateAndStoreLearningPathArtwork(params: {
  learningPathId: string;
  title: string;
  creatorName?: string;
  category: string;
  description?: string | null;
  shortDescription?: string | null;
  difficulty?: string | null;
  learningObjectives?: string[] | null;
  tags?: string[] | null;
}): Promise<LearningPathArtworkResult> {
  if (!openaiKey()) {
    return {
      storagePath: null,
      publicUrl: null,
      status: "failed",
      source: null,
      error: "OPENAI_API_KEY is not configured.",
    };
  }

  const prompt = buildLearningPathArtworkPrompt({
    title: params.title,
    category: params.category,
    description: params.description,
    shortDescription: params.shortDescription,
    difficulty: params.difficulty,
    learningObjectives: params.learningObjectives,
    tags: params.tags,
  });

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= ARTWORK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const bytes = await callOpenAiImages(prompt);
      const storagePath = `content-factory/${params.learningPathId}/artwork.png`;
      const storage = getStorageService();
      const uploaded = await storage.upload({
        path: storagePath,
        body: bytes,
        contentType: "image/png",
        isPublic: true,
      });

      const directPublic = storage.getPublicUrl(uploaded.path);
      const publicUrl =
        directPublic ||
        `${siteUrl().replace(/\/$/, "")}/api/learn/artwork/${params.learningPathId}`;

      return {
        storagePath: uploaded.path,
        publicUrl,
        status: "generated",
        source: "openai",
        error: null,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < ARTWORK_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  return {
    storagePath: null,
    publicUrl: null,
    status: "failed",
    source: null,
    error: lastError ?? "OpenAI artwork generation failed.",
  };
}

/** @deprecated Prefer generateAndStoreLearningPathArtwork; kept for call-site compatibility. */
export async function generateLearningPathArtworkOrNull(
  params: Parameters<typeof generateAndStoreLearningPathArtwork>[0],
): Promise<{ storagePath: string; publicUrl: string | null } | null> {
  const result = await generateAndStoreLearningPathArtwork(params);
  if (result.status !== "generated" || !result.storagePath) return null;
  return { storagePath: result.storagePath, publicUrl: result.publicUrl };
}
