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
      title: item.snippet.title,
      description: item.snippet.description ?? "",
      thumbnail: item.snippet.thumbnails?.high?.url ?? null,
      durationSeconds: parseDuration(item.contentDetails?.duration ?? "PT0S"),
      position: 0,
    },
  ];
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
    for (const item of json.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      videos.push({
        videoId,
        title: item.snippet.title,
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
