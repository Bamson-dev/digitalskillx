/** Extract a YouTube video id from common URL formats. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(url)) return url;
  return null;
}

/** Extract a Vimeo video id. */
export function vimeoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function wistiaEmbedUrl(url: string) {
  if (url.includes("fast.wistia.net/embed/iframe/")) return url;
  if (url.includes("fast.wistia.com/embed/iframe/")) return url;
  const media = url.match(/wistia\.(?:com|net)\/medias\/([a-z0-9]+)/i);
  if (media) return `https://fast.wistia.net/embed/iframe/${media[1]}`;
  const embed = url.match(/embed\/iframe\/([a-z0-9]+)/i);
  if (embed) return `https://fast.wistia.net/embed/iframe/${embed[1]}`;
  return null;
}

function loomEmbedUrl(url: string) {
  if (url.includes("loom.com/embed/")) return url;
  const share = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
  if (share) return `https://www.loom.com/embed/${share[1]}`;
  return null;
}

export type EmbeddedVideo =
  | { provider: "youtube"; id: string; embedUrl: string }
  | { provider: "vimeo"; id: string; embedUrl: string }
  | { provider: "wistia"; embedUrl: string }
  | { provider: "loom"; embedUrl: string }
  | { provider: "file"; embedUrl: string }
  | null;

/** Privacy-enhanced YouTube embed URL for student lesson pages only. */
export function youtubeLessonEmbedUrl(videoId: string, origin?: string): string {
  const params = new URLSearchParams({
    modestbranding: "1",
    rel: "0",
    disablekb: "0",
    playsinline: "1",
  });
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Resolve a lesson content URL to a playable embed descriptor. */
export function resolveVideo(url: string | null | undefined): EmbeddedVideo {
  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: "youtube",
      id: yt,
      embedUrl: `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`,
    };
  }

  const vm = vimeoId(url);
  if (vm) {
    return { provider: "vimeo", id: vm, embedUrl: `https://player.vimeo.com/video/${vm}` };
  }

  if (url?.includes("player.vimeo.com/video/")) {
    const id = url.match(/player\.vimeo\.com\/video\/(\d+)/)?.[1];
    if (id) return { provider: "vimeo", id, embedUrl: url };
  }

  const wistia = url ? wistiaEmbedUrl(url) : null;
  if (wistia) return { provider: "wistia", embedUrl: wistia };

  const loom = url ? loomEmbedUrl(url) : null;
  if (loom) return { provider: "loom", embedUrl: loom };

  if (url) return { provider: "file", embedUrl: url };
  return null;
}
