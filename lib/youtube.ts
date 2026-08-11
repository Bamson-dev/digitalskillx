import "server-only";

const API = "https://www.googleapis.com/youtube/v3";

export type YoutubeVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  position: number;
};

export type YoutubeInput =
  | { type: "video"; id: string }
  | { type: "playlist"; id: string }
  | { type: "channel"; id: string }
  | { type: "handle"; handle: string };

export type YoutubeFetchOptions = {
  apiKey?: string;
};

/** Classify a pasted YouTube URL (PRD §7.1). */
export function detectYoutubeInput(url: string): YoutubeInput | null {
  try {
    const u = new URL(url);
    const list = u.searchParams.get("list");
    if (list) return { type: "playlist", id: list };
    const v = u.searchParams.get("v");
    if (v) return { type: "video", id: v };
    if (u.pathname.startsWith("/playlist")) {
      const id = u.searchParams.get("list");
      if (id) return { type: "playlist", id };
    }
    if (u.hostname === "youtu.be") return { type: "video", id: u.pathname.slice(1) };
    if (u.pathname.startsWith("/embed/")) return { type: "video", id: u.pathname.split("/")[2] };
    if (u.pathname.startsWith("/channel/")) return { type: "channel", id: u.pathname.split("/")[2] };
    if (u.pathname.startsWith("/@")) return { type: "handle", handle: u.pathname.slice(2) };
  } catch {
    if (/^[\w-]{11}$/.test(url)) return { type: "video", id: url };
  }
  return null;
}

import { getYoutubeApiKey } from "@/lib/env-youtube";

async function resolveKey(options?: YoutubeFetchOptions): Promise<string> {
  if (options?.apiKey?.trim()) return options.apiKey.trim();
  return getYoutubeApiKey();
}

/** Normalize YouTube Data API error bodies for callers (quota, auth, generic). */
export function formatYoutubeApiError(status: number, json: unknown): string {
  const body = json as {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  const reason = body?.error?.errors?.[0]?.reason ?? "";
  const message = body?.error?.message ?? "";
  if (
    status === 403 &&
    (/quota/i.test(reason) || /quota/i.test(message) || reason === "quotaExceeded")
  ) {
    return "YouTube API quota exceeded. Try again after the daily quota resets.";
  }
  if (status === 403 && (/keyInvalid|forbidden/i.test(reason) || /API key/i.test(message))) {
    return "YouTube API key is invalid or YouTube Data API is not enabled.";
  }
  return (
    message ||
    `YouTube API error (${status}). Check that the API key is valid and the YouTube Data API is enabled.`
  );
}

/** Parse ISO-8601 duration (e.g. PT1H2M30S) to seconds. */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function fetchVideoDetails(
  ids: string[],
  apiKey: string,
): Promise<Map<string, { duration: number }>> {
  const map = new Map<string, { duration: number }>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const res = await fetch(
      `${API}/videos?part=contentDetails&id=${batch.join(",")}&key=${apiKey}`,
    );
    const json = await res.json();
    for (const item of json.items ?? []) {
      map.set(item.id, { duration: parseDuration(item.contentDetails?.duration ?? "PT0S") });
    }
  }
  return map;
}

export async function fetchSingleVideo(
  id: string,
  options?: YoutubeFetchOptions,
): Promise<YoutubeVideo[]> {
  const apiKey = await resolveKey(options);
  const res = await fetch(`${API}/videos?part=snippet,contentDetails&id=${id}&key=${apiKey}`);
  const json = await res.json();
  const item = json.items?.[0];
  if (!item) return [];
  return [
    {
      videoId: id,
      title: String(item.snippet?.title ?? "").trim(),
      description: item.snippet.description ?? "",
      thumbnail: item.snippet.thumbnails?.high?.url ?? null,
      durationSeconds: parseDuration(item.contentDetails?.duration ?? "PT0S"),
      position: 0,
    },
  ];
}

/** Fetch a playlist title for naming imported modules. */
export async function fetchPlaylistTitle(
  playlistId: string,
  options?: YoutubeFetchOptions,
): Promise<string | null> {
  const apiKey = await resolveKey(options);
  const res = await fetch(
    `${API}/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${apiKey}`,
  );
  const json = await res.json();
  if (!res.ok) return null;
  const title = json.items?.[0]?.snippet?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export async function fetchPlaylist(
  playlistId: string,
  options?: YoutubeFetchOptions,
): Promise<YoutubeVideo[]> {
  const apiKey = await resolveKey(options);
  const videos: YoutubeVideo[] = [];
  let pageToken = "";
  let position = 0;
  do {
    const res = await fetch(
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&pageToken=${pageToken}&key=${apiKey}`,
    );
    const json = await res.json();
    if (!res.ok) {
      throw new Error(formatYoutubeApiError(res.status, json));
    }
    for (const item of json.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const kind = item.snippet?.resourceId?.kind;
      if (!videoId || kind !== "youtube#video") continue;
      videos.push({
        videoId,
        title: String(item.snippet?.title ?? "").trim(),
        description: item.snippet.description ?? "",
        thumbnail: item.snippet.thumbnails?.high?.url ?? null,
        durationSeconds: null,
        position: position++,
      });
    }
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);

  const details = await fetchVideoDetails(
    videos.map((v) => v.videoId),
    apiKey,
  );
  for (const v of videos) v.durationSeconds = details.get(v.videoId)?.duration ?? null;
  return videos;
}

export type YoutubeChannelMeta = {
  channelId: string;
  title: string;
  description: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  channelUrl: string;
};

/** Fetch public channel metadata for creator research (quota-conscious: one call). */
export async function fetchChannelMeta(
  channelId: string,
  options?: YoutubeFetchOptions,
): Promise<YoutubeChannelMeta | null> {
  const apiKey = await resolveKey(options);
  const res = await fetch(
    `${API}/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`,
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(formatYoutubeApiError(res.status, json));
  }
  const item = json.items?.[0];
  if (!item) return null;
  const customUrl =
    typeof item.snippet?.customUrl === "string" && item.snippet.customUrl.trim()
      ? item.snippet.customUrl.trim()
      : null;
  return {
    channelId: item.id,
    title: String(item.snippet?.title ?? "").trim() || "YouTube Creator",
    description: String(item.snippet?.description ?? ""),
    customUrl,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: item.statistics?.subscriberCount
      ? Number(item.statistics.subscriberCount)
      : null,
    videoCount: item.statistics?.videoCount ? Number(item.statistics.videoCount) : null,
    channelUrl: customUrl
      ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
      : `https://www.youtube.com/channel/${item.id}`,
  };
}

/** Fetch playlist snippet including channel id (one API call). */
export async function fetchPlaylistMeta(
  playlistId: string,
  options?: YoutubeFetchOptions,
): Promise<{
  playlistId: string;
  title: string;
  description: string;
  channelId: string | null;
  channelTitle: string | null;
  thumbnailUrl: string | null;
} | null> {
  const apiKey = await resolveKey(options);
  const res = await fetch(
    `${API}/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${apiKey}`,
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(formatYoutubeApiError(res.status, json));
  }
  const item = json.items?.[0];
  if (!item) return null;
  return {
    playlistId,
    title: String(item.snippet?.title ?? "").trim() || "Untitled playlist",
    description: String(item.snippet?.description ?? ""),
    channelId: item.snippet?.channelId ? String(item.snippet.channelId) : null,
    channelTitle: item.snippet?.channelTitle ? String(item.snippet.channelTitle) : null,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? null,
  };
}

export async function fetchChannelUploads(
  channelId: string,
  options?: YoutubeFetchOptions,
): Promise<YoutubeVideo[]> {
  const apiKey = await resolveKey(options);
  const res = await fetch(`${API}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
  const json = await res.json();
  const uploads = json.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  return fetchPlaylist(uploads, options);
}

export async function resolveHandle(
  handle: string,
  options?: YoutubeFetchOptions,
): Promise<string | null> {
  const apiKey = await resolveKey(options);
  const res = await fetch(`${API}/channels?part=id&forHandle=${handle}&key=${apiKey}`);
  const json = await res.json();
  return json.items?.[0]?.id ?? null;
}

/** Resolve any supported input to its list of videos. */
export async function fetchVideosForInput(
  input: YoutubeInput,
  options?: YoutubeFetchOptions,
): Promise<YoutubeVideo[]> {
  switch (input.type) {
    case "video":
      return fetchSingleVideo(input.id, options);
    case "playlist":
      return fetchPlaylist(input.id, options);
    case "channel":
      return fetchChannelUploads(input.id, options);
    case "handle": {
      const channelId = await resolveHandle(input.handle, options);
      return channelId ? fetchChannelUploads(channelId, options) : [];
    }
  }
}
