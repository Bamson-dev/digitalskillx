"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveVideo } from "@/lib/video";
import { normalizeMediaUrl } from "@/lib/media-url";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { cn } from "@/lib/utils";

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url);
}

/** Returns a playable promo embed, or null when the URL cannot be shown as video. */
export function resolvePromoVideoEmbed(
  promoVideoUrl: string | null | undefined,
): { type: "iframe" | "video"; src: string } | null {
  const trimmed = promoVideoUrl?.trim();
  if (!trimmed) return null;

  const resolved = resolveVideo(trimmed);
  if (!resolved) return null;

  if (resolved.provider === "file") {
    return isDirectVideoUrl(resolved.embedUrl)
      ? { type: "video", src: resolved.embedUrl }
      : null;
  }

  return { type: "iframe", src: resolved.embedUrl };
}

type CourseHeroMediaProps = {
  title: string;
  thumbnailUrl: string | null;
  promoVideoUrl: string | null;
  className?: string;
  priority?: boolean;
};

export function CourseHeroMedia({
  title,
  thumbnailUrl,
  promoVideoUrl,
  className,
}: CourseHeroMediaProps) {
  const embed = useMemo(() => resolvePromoVideoEmbed(promoVideoUrl), [promoVideoUrl]);
  const imageSrc = useMemo(() => normalizeMediaUrl(thumbnailUrl), [thumbnailUrl]);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
    setImageFailed(false);
  }, [promoVideoUrl, thumbnailUrl]);

  const showVideo = Boolean(embed) && !videoFailed;
  const showThumbnail = Boolean(imageSrc) && !imageFailed && !showVideo;

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-neutral-900",
        className,
      )}
    >
      {showVideo && embed ? (
        embed.type === "video" ? (
          <video
            src={embed.src}
            controls
            playsInline
            className="h-full w-full object-cover"
            title={title}
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <iframe
            src={embed.src}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
            onError={() => setVideoFailed(true)}
          />
        )
      ) : showThumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- bypass Next image optimizer for Supabase/CDN URLs
        <img
          src={imageSrc!}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <CourseThumbnailPlaceholder title={title} size="hero" className="absolute inset-0" />
      )}
    </div>
  );
}
