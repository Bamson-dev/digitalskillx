import "server-only";
import {
  detectYoutubeInput,
  fetchPlaylist,
  fetchPlaylistTitle,
  fetchSingleVideo,
  type YoutubeVideo,
} from "@/lib/youtube";
import type { LessonImportSource } from "@/lib/lesson-import-shared";

export type { LessonImportSource } from "@/lib/lesson-import-shared";

export type ImportedLessonDraft = {
  title: string;
  description: string;
  contentUrl: string;
  youtubeVideoId: string | null;
  durationSeconds: number | null;
  dedupeKey: string;
};

type OembedPayload = {
  title?: string;
  html?: string;
  thumbnail_url?: string;
  duration?: number;
};

const SOURCE_LABELS: Record<LessonImportSource, string> = {
  youtube_playlist: "YouTube playlist",
  youtube_video: "YouTube single video",
  vimeo: "Vimeo video",
  wistia: "Wistia video",
  loom: "Loom video",
};

export function importSourceLabel(source: LessonImportSource) {
  return SOURCE_LABELS[source];
}

function iframeSrcFromHtml(html: string | undefined) {
  if (!html) return null;
  const match = html.match(/src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function normalizeUrl(url: string) {
  return url.trim();
}

function isYoutubePlaylistUrl(url: string) {
  const input = detectYoutubeInput(url);
  return input?.type === "playlist";
}

function isYoutubeSingleVideoUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("list")) return false;
  } catch {
    // raw id handled below
  }
  const input = detectYoutubeInput(url);
  return input?.type === "video";
}

function isVimeoUrl(url: string) {
  try {
    const u = new URL(url);
    return /(^|\.)vimeo\.com$/i.test(u.hostname) || u.hostname === "player.vimeo.com";
  } catch {
    return false;
  }
}

function isWistiaUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.includes("wistia.com") || u.hostname.includes("wistia.net");
  } catch {
    return false;
  }
}

function isLoomUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname === "www.loom.com" || u.hostname === "loom.com";
  } catch {
    return false;
  }
}

export function validateImportUrl(source: LessonImportSource, rawUrl: string): string | null {
  const url = normalizeUrl(rawUrl);
  if (!url) return "Paste a URL to import.";

  switch (source) {
    case "youtube_playlist":
      if (!isYoutubePlaylistUrl(url)) {
        return "That URL does not look like a YouTube playlist. Example: https://www.youtube.com/playlist?list=…";
      }
      return null;
    case "youtube_video":
      if (!isYoutubeSingleVideoUrl(url)) {
        return "That URL does not look like a single YouTube video. Example: https://www.youtube.com/watch?v=…";
      }
      return null;
    case "vimeo":
      if (!isVimeoUrl(url)) {
        return "That URL does not look like a Vimeo video. Example: https://vimeo.com/123456789";
      }
      return null;
    case "wistia":
      if (!isWistiaUrl(url)) {
        return "That URL does not look like a Wistia video. Example: https://yourcompany.wistia.com/medias/…";
      }
      return null;
    case "loom":
      if (!isLoomUrl(url) || !url.includes("/share/")) {
        return "That URL does not look like a Loom share link. Example: https://www.loom.com/share/…";
      }
      return null;
    default:
      return "Unknown import source.";
  }
}

async function fetchOembed(endpoint: string, url: string): Promise<OembedPayload> {
  const res = await fetch(`${endpoint}?url=${encodeURIComponent(url)}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Could not fetch metadata (${res.status}). Check that the video is public.`);
  }
  return res.json() as Promise<OembedPayload>;
}

function fromYoutubeVideo(v: YoutubeVideo, contentUrl: string): ImportedLessonDraft {
  const title = v.title.trim() || `Video ${v.videoId}`;
  return {
    title,
    description: v.description.slice(0, 5000),
    contentUrl,
    youtubeVideoId: v.videoId,
    durationSeconds: v.durationSeconds,
    dedupeKey: `youtube:${v.videoId}`,
  };
}

async function importYoutubePlaylist(
  url: string,
  options?: { youtubeApiKey?: string },
): Promise<ImportedLessonDraft[]> {
  const input = detectYoutubeInput(url);
  if (!input || input.type !== "playlist") {
    throw new Error("Invalid YouTube playlist URL.");
  }
  const videos = await fetchPlaylist(input.id, { apiKey: options?.youtubeApiKey });
  return videos.map((v) =>
    fromYoutubeVideo(v, `https://www.youtube.com/watch?v=${v.videoId}`),
  );
}

async function importYoutubeVideo(
  url: string,
  options?: { youtubeApiKey?: string },
): Promise<ImportedLessonDraft[]> {
  const input = detectYoutubeInput(url);
  if (!input || input.type !== "video") {
    throw new Error("Invalid YouTube video URL.");
  }
  const videos = await fetchSingleVideo(input.id, { apiKey: options?.youtubeApiKey });
  if (videos.length === 0) throw new Error("YouTube video not found.");
  return [fromYoutubeVideo(videos[0], `https://www.youtube.com/watch?v=${input.id}`)];
}

async function importVimeo(url: string): Promise<ImportedLessonDraft[]> {
  const data = await fetchOembed("https://vimeo.com/api/oembed.json", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Vimeo did not return an embed URL.");
  return [
    {
      title: data.title?.trim() || "Untitled video",
      description: "",
      contentUrl: embedUrl,
      youtubeVideoId: null,
      durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
      dedupeKey: `vimeo:${embedUrl}`,
    },
  ];
}

async function importWistia(url: string): Promise<ImportedLessonDraft[]> {
  const data = await fetchOembed("https://fast.wistia.com/oembed", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Wistia did not return an embed URL.");
  return [
    {
      title: data.title?.trim() || "Imported Wistia lesson",
      description: "",
      contentUrl: embedUrl,
      youtubeVideoId: null,
      durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
      dedupeKey: `wistia:${embedUrl}`,
    },
  ];
}

async function importLoom(url: string): Promise<ImportedLessonDraft[]> {
  const data = await fetchOembed("https://www.loom.com/v1/oembed", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Loom did not return an embed URL.");
  return [
    {
      title: data.title?.trim() || "Imported Loom lesson",
      description: "",
      contentUrl: embedUrl,
      youtubeVideoId: null,
      durationSeconds: null,
      dedupeKey: `loom:${embedUrl}`,
    },
  ];
}

export async function fetchLessonsForImport(
  source: LessonImportSource,
  rawUrl: string,
  options?: { youtubeApiKey?: string },
): Promise<ImportedLessonDraft[]> {
  const validationError = validateImportUrl(source, rawUrl);
  if (validationError) throw new Error(validationError);

  const url = normalizeUrl(rawUrl);
  const youtubeOpts = { youtubeApiKey: options?.youtubeApiKey };

  switch (source) {
    case "youtube_playlist":
      return importYoutubePlaylist(url, youtubeOpts);
    case "youtube_video":
      return importYoutubeVideo(url, youtubeOpts);
    case "vimeo":
      return importVimeo(url);
    case "wistia":
      return importWistia(url);
    case "loom":
      return importLoom(url);
    default:
      throw new Error("Unknown import source.");
  }
}

export async function resolveImportModuleTitle(
  source: LessonImportSource,
  rawUrl: string,
  lessons: ImportedLessonDraft[],
  options?: { youtubeApiKey?: string },
): Promise<string> {
  const firstTitle = lessons[0]?.title?.trim();

  if (source === "youtube_playlist") {
    const input = detectYoutubeInput(normalizeUrl(rawUrl));
    if (input?.type === "playlist") {
      const playlistTitle = await fetchPlaylistTitle(input.id, {
        apiKey: options?.youtubeApiKey,
      });
      if (playlistTitle) return playlistTitle;
    }
  }

  if (firstTitle) return firstTitle;
  return "New module";
}
