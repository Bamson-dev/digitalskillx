"use client";

import Image from "next/image";
import { useState } from "react";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { cn } from "@/lib/utils";

export type CourseMediaAspect = "video" | "hero" | "portrait" | "square" | "none";

const ASPECT: Record<Exclude<CourseMediaAspect, "none">, string> = {
  video: "aspect-video", // 16:9 — catalog / cards
  hero: "aspect-[21/9] min-h-[200px] sm:min-h-[260px] lg:aspect-[2.4/1] lg:min-h-[320px]",
  portrait: "aspect-[4/3]",
  square: "aspect-square",
};

/**
 * Consistent course thumbnail / cover rendering.
 * Fixed aspect box + object-cover so source dimensions never drive layout height.
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
        "relative w-full overflow-hidden bg-neutral-100",
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
          className="object-cover object-center"
          onError={() => setFailed(true)}
        />
      ) : (
        <CourseThumbnailPlaceholder title={label} size={placeholderSize} />
      )}
    </div>
  );
}
