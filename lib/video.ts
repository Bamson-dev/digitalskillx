/** Extract a YouTube video id from common URL formats. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
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

export type EmbeddedVideo =
  | { provider: "youtube"; id: string; embedUrl: string }
  | { provider: "vimeo"; id: string; embedUrl: string }
  | { provider: "file"; embedUrl: string }
  | null;

/** Resolve a lesson content URL to a playable embed descriptor. */
export function resolveVideo(url: string | null | undefined): EmbeddedVideo {
  const yt = youtubeId(url);
  if (yt)
    return {
      provider: "youtube",
      id: yt,
      embedUrl: `https://www.youtube.com/embed/${yt}?rel=0&modestbranding=1`,
    };
  const vm = vimeoId(url);
  if (vm) return { provider: "vimeo", id: vm, embedUrl: `https://player.vimeo.com/video/${vm}` };
  if (url) return { provider: "file", embedUrl: url };
  return null;
}
