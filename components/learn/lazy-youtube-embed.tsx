"use client";

import { useState } from "react";
import { youtubeLessonEmbedUrl } from "@/lib/video";

export function LazyYoutubeEmbed({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [active, setActive] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 text-left"
        aria-label={`Play ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-neutral-900">
            Play lesson
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        title={title}
        src={youtubeLessonEmbedUrl(videoId)}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
