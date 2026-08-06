/**
 * VideoProvider abstraction — architecture for future secure video hosting.
 *
 * NO production migration yet. Existing YouTube / Vimeo / Wistia / Loom / file
 * playback via `lib/video.ts` `resolveVideo()` remains the live path.
 *
 * Future providers: Cloudflare Stream, Bunny Stream, Mux, Vimeo (signed).
 * The lesson player should consume `ResolvedPlayback` only — never provider SDKs directly.
 */

export type VideoProviderId =
  | "youtube"
  | "vimeo"
  | "wistia"
  | "loom"
  | "file"
  | "cloudflare_stream"
  | "bunny_stream"
  | "mux";

export type PlaybackKind = "iframe" | "hls" | "mp4" | "signed_url";

export type ResolvedPlayback = {
  provider: VideoProviderId;
  kind: PlaybackKind;
  /** Ready-to-play URL (embed or media). May be short-lived when signed. */
  url: string;
  /** Optional poster / thumbnail. */
  posterUrl?: string | null;
  /** Seconds until signed URL expires (if applicable). */
  expiresInSeconds?: number | null;
  /** Opaque provider asset id for analytics / revoke. */
  assetId?: string | null;
};

export type SignPlaybackParams = {
  provider: VideoProviderId;
  assetId: string;
  /** Viewer identity for audit / watermark. */
  viewerId?: string;
  ttlSeconds?: number;
};

/**
 * Provider interface — implement one class per host. Swap via config without
 * changing LessonPlayer.
 */
export interface VideoProvider {
  readonly id: VideoProviderId;
  /** Resolve a stored lesson reference into a playable descriptor. */
  resolve(ref: { contentUrl?: string | null; providerAssetId?: string | null }): Promise<ResolvedPlayback | null>;
  /** Issue a temporary signed URL when the provider supports it. */
  signPlayback?(params: SignPlaybackParams): Promise<ResolvedPlayback>;
}

/** Registry placeholder — populate when migrating off YouTube for a course. */
const providers = new Map<VideoProviderId, VideoProvider>();

export function registerVideoProvider(provider: VideoProvider) {
  providers.set(provider.id, provider);
}

export function getVideoProvider(id: VideoProviderId): VideoProvider | undefined {
  return providers.get(id);
}

/**
 * Compatibility bridge: map today's `resolveVideo()` result shape into ResolvedPlayback.
 * Used until secure providers are wired.
 */
export function legacyEmbedToPlayback(input: {
  provider: string;
  embedUrl: string;
  id?: string;
}): ResolvedPlayback {
  const provider = (input.provider === "file" ? "file" : input.provider) as VideoProviderId;
  return {
    provider,
    kind: input.provider === "file" ? "mp4" : "iframe",
    url: input.embedUrl,
    assetId: input.id ?? null,
    expiresInSeconds: null,
  };
}
