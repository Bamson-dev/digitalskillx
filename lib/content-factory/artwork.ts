import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";
import { getStorageService } from "@/lib/storage";

function openaiKey(): string {
  return (runtimeEnv("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY ?? "").trim();
}

/**
 * Generate course artwork via OpenAI Images API and store on Contabo/local StorageService.
 * Returns null when OpenAI is not configured (job continues without artwork).
 */
export async function generateAndStoreLearningPathArtwork(params: {
  learningPathId: string;
  title: string;
  creatorName: string;
  category: string;
}): Promise<{ storagePath: string; publicUrl: string | null } | null> {
  const key = openaiKey();
  if (!key) return null;

  const prompt = [
    "Clean professional educational course cover image for DigitalSkillX.",
    `Topic: ${params.title}.`,
    `Category: ${params.category || "skills"}.`,
    "Minimal typography space, modern flat design, no logos of other brands,",
    "do not depict a real person, do not imitate a YouTube thumbnail,",
    "no fake partnership badges, no watermark text claiming endorsement.",
  ].join(" ");

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

  const storagePath = `content-factory/${params.learningPathId}/artwork.png`;
  const storage = getStorageService();
  const uploaded = await storage.upload({
    path: storagePath,
    body: bytes,
    contentType: "image/png",
    isPublic: true,
  });

  return {
    storagePath: uploaded.path,
    publicUrl: storage.getPublicUrl(uploaded.path),
  };
}
