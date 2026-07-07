import "server-only";
import {
  detectYoutubeInput,
  fetchPlaylist,
  fetchPlaylistTitle,
  fetchSingleVideo,
  type YoutubeVideo,
} from "@/lib/youtube";
import type { LessonImportSource, ImportSkipReason } from "@/lib/lesson-import-shared";

export type { LessonImportSource, ImportSkipReason } from "@/lib/lesson-import-shared";

export type ImportedLessonDraft = {
  title: string;
  description: string;
  contentUrl: string;
  youtubeVideoId: string | null;
  durationSeconds: number | null;
  dedupeKey: string;
};

export type LessonsImportResult = {
  lessons: ImportedLessonDraft[];
  skipped: ImportSkipReason[];
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

function isUnavailableYoutubeTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return normalized === "private video" || normalized === "deleted video";
}

const GENERIC_FALLBACK_TITLE = /^video [\w-]{11}$/i;

function fromYoutubeVideo(v: YoutubeVideo, contentUrl: string): ImportedLessonDraft | null {
  const title = v.title.trim();
  if (!title || GENERIC_FALLBACK_TITLE.test(title) || isUnavailableYoutubeTitle(title)) return null;
  return {
    title,
    description: v.description.slice(0, 5000),
    contentUrl,
    youtubeVideoId: v.videoId,
    durationSeconds: v.durationSeconds,
    dedupeKey: `youtube:${v.videoId}`,
  };
}

function skipReasonForVideo(v: YoutubeVideo): ImportSkipReason {
  const title = v.title.trim();
  if (!title) {
    return { videoId: v.videoId, title: "", reason: "Missing video title" };
  }
  if (GENERIC_FALLBACK_TITLE.test(title)) {
    return { videoId: v.videoId, title, reason: "Missing video title" };
  }
  if (isUnavailableYoutubeTitle(title)) {
    return { videoId: v.videoId, title, reason: "Video is private or deleted on YouTube" };
  }
  return { videoId: v.videoId, title, reason: "Could not import video" };
}

async function importYoutubePlaylist(
  url: string,
  options?: { youtubeApiKey?: string },
): Promise<LessonsImportResult> {
  const input = detectYoutubeInput(url);
  if (!input || input.type !== "playlist") {
    throw new Error("Invalid YouTube playlist URL.");
  }
  const videos = await fetchPlaylist(input.id, { apiKey: options?.youtubeApiKey });
  const lessons: ImportedLessonDraft[] = [];
  const skipped: ImportSkipReason[] = [];

  for (const video of videos) {
    const draft = fromYoutubeVideo(video, `https://www.youtube.com/watch?v=${video.videoId}`);
    if (draft) lessons.push(draft);
    else skipped.push(skipReasonForVideo(video));
  }

  return { lessons, skipped };
}

async function importYoutubeVideo(
  url: string,
  options?: { youtubeApiKey?: string },
): Promise<LessonsImportResult> {
  const input = detectYoutubeInput(url);
  if (!input || input.type !== "video") {
    throw new Error("Invalid YouTube video URL.");
  }
  const videos = await fetchSingleVideo(input.id, { apiKey: options?.youtubeApiKey });
  if (videos.length === 0) throw new Error("YouTube video not found.");

  const draft = fromYoutubeVideo(videos[0], `https://www.youtube.com/watch?v=${input.id}`);
  if (!draft) {
    return { lessons: [], skipped: [skipReasonForVideo(videos[0])] };
  }
  return { lessons: [draft], skipped: [] };
}

async function importVimeo(url: string): Promise<LessonsImportResult> {
  const data = await fetchOembed("https://vimeo.com/api/oembed.json", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Vimeo did not return an embed URL.");
  const title = data.title?.trim();
  if (!title) {
    return {
      lessons: [],
      skipped: [{ videoId: null, title: "", reason: "Missing video title" }],
    };
  }
  return {
    lessons: [
      {
        title,
        description: "",
        contentUrl: embedUrl,
        youtubeVideoId: null,
        durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
        dedupeKey: `vimeo:${embedUrl}`,
      },
    ],
    skipped: [],
  };
}

async function importWistia(url: string): Promise<LessonsImportResult> {
  const data = await fetchOembed("https://fast.wistia.com/oembed", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Wistia did not return an embed URL.");
  const title = data.title?.trim();
  if (!title) {
    return {
      lessons: [],
      skipped: [{ videoId: null, title: "", reason: "Missing video title" }],
    };
  }
  return {
    lessons: [
      {
        title,
        description: "",
        contentUrl: embedUrl,
        youtubeVideoId: null,
        durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
        dedupeKey: `wistia:${embedUrl}`,
      },
    ],
    skipped: [],
  };
}

async function importLoom(url: string): Promise<LessonsImportResult> {
  const data = await fetchOembed("https://www.loom.com/v1/oembed", url);
  const embedUrl = iframeSrcFromHtml(data.html);
  if (!embedUrl) throw new Error("Loom did not return an embed URL.");
  const title = data.title?.trim();
  if (!title) {
    return {
      lessons: [],
      skipped: [{ videoId: null, title: "", reason: "Missing video title" }],
    };
  }
  return {
    lessons: [
      {
        title,
        description: "",
        contentUrl: embedUrl,
        youtubeVideoId: null,
        durationSeconds: null,
        dedupeKey: `loom:${embedUrl}`,
      },
    ],
    skipped: [],
  };
}

export async function fetchLessonsForImport(
  source: LessonImportSource,
  rawUrl: string,
  options?: { youtubeApiKey?: string },
): Promise<LessonsImportResult> {
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
