"use client";

import Image from "next/image";
import { useState } from "react";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { cn } from "@/lib/utils";

export type CourseMediaAspect = "video" | "hero" | "portrait" | "square" | "none";

/**
 * Course thumbnails are authored at 1280×720 (16:9). Keep catalog + featured
 * frames on that ratio so object-cover fills edge-to-edge without letterboxing
 * or cropping baked-in headline text.
 */
const ASPECT: Record<Exclude<CourseMediaAspect, "none">, string> = {
  video: "aspect-video",
  hero: "aspect-video w-full",
  portrait: "aspect-video",
  square: "aspect-square",
};

/**
 * Consistent course thumbnail / cover rendering.
 * Fixed aspect box + absolute fill + object-cover so source dimensions never drive layout.
 */
export function CourseMediaImage({
  src,
  alt,
  title,
  aspect = "video",
  sizes = "(max-width: 640px) 100vw, 33vw",
  priority = false,
  className,
  frameClassName,
  placeholderSize = "default",
  unoptimized,
}: {
  src: string | null | undefined;
  alt: string;
  title?: string;
  aspect?: CourseMediaAspect;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Extra classes on the outer frame (radius, border). */
  frameClassName?: string;
  placeholderSize?: "default" | "compact" | "hero";
  unoptimized?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const label = title?.trim() || alt.trim() || "Course";

  return (
    <div
      className={cn(
        "relative w-full min-w-0 overflow-hidden bg-neutral-950",
        aspect !== "none" ? ASPECT[aspect] : "h-full w-full",
        frameClassName,
        className,
      )}
    >
      {showImage ? (
        <Image
          src={src!}
          alt={alt || label}
          fill
          priority={priority}
          sizes={sizes}
          unoptimized={unoptimized}
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ objectFit: "cover", objectPosition: "center" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <CourseThumbnailPlaceholder title={label} size={placeholderSize} />
      )}
    </div>
  );
}
