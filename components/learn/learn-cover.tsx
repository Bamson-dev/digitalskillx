"use client";

import { useState } from "react";
import { categoryFallbackTone } from "@/lib/content-factory/artwork-shared";
import { learnCoverNeedsCategoryFallback, resolveLearnCoverUrl } from "@/lib/learn-cover";

export function LearnCover({
  path,
  className = "aspect-[16/10]",
  imgClassName = "h-full w-full object-cover",
}: {
  path: {
    id: string;
    category?: string | null;
    artwork_public_url?: string | null;
    artwork_storage_path?: string | null;
    artwork_status?: string | null;
  };
  className?: string;
  imgClassName?: string;
}) {
  const initialUrl = resolveLearnCoverUrl(path);
  const [failed, setFailed] = useState(false);
  const showCategory =
    failed || learnCoverNeedsCategoryFallback(path) || !initialUrl;
  const tone = categoryFallbackTone(path.category);

  if (showCategory) {
    return (
      <div
        className={`${className} relative overflow-hidden`}
        style={{
          background: `linear-gradient(145deg, ${tone.from} 0%, ${tone.to} 100%)`,
        }}
        aria-hidden
      >
        <div className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.25), transparent 50%)",
          }}
        />
        <div className="relative flex h-full items-end p-4">
          <p className="max-w-full truncate text-sm font-semibold tracking-wide text-white/95">
            {tone.label}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-neutral-100`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={initialUrl!}
        alt=""
        className={imgClassName}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
