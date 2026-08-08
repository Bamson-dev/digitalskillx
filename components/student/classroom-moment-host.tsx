"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import {
  buildClassroomMoment,
  classroomMomentEventName,
  type CelebrationLevel,
  type ClassroomMoment,
  type CompanionMood,
} from "@/lib/classroom-engagement";
import { cn } from "@/lib/utils";

type HostMoment = ClassroomMoment & { dedupeKey?: string };

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function moodMotionClass(mood: CompanionMood, level: CelebrationLevel, dancing: boolean) {
  if (dancing) return "dsx-companion-dance";
  if (level === "energetic") return "dsx-companion-energetic";
  if (level === "bigger" || level === "small") return "dsx-companion-pop";
  switch (mood) {
    case "happy":
    case "correct":
      return "dsx-companion-nod";
    case "thinking":
      return "dsx-companion-think";
    case "supportive":
    case "incorrect":
      return "dsx-companion-soft";
    case "welcome":
      return "dsx-companion-welcome";
    default:
      return level === "subtle" ? "dsx-companion-nod" : undefined;
  }
}

function moodAccent(mood: CompanionMood) {
  switch (mood) {
    case "supportive":
    case "incorrect":
      return "#737373";
    case "thinking":
      return "#525252";
    case "certificate":
    case "celebration":
    case "streak":
      return "#dc2626";
    case "happy":
    case "correct":
      return "#171717";
    default:
      return "#171717";
  }
}

/** Brand mark companion — geometric X, expression via motion + accent only. */
function BrandCompanionMark({
  mood,
  level,
  dancing,
}: {
  mood: CompanionMood;
  level: CelebrationLevel;
  dancing: boolean;
}) {
  const reduced = prefersReducedMotion();
  const motion = !reduced ? moodMotionClass(mood, level, dancing) : undefined;
  const accent = moodAccent(mood);
  const showDot = mood === "celebration" || mood === "certificate" || level === "energetic";

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-11 w-11 shrink-0 sm:h-12 sm:w-12", motion)}
      aria-hidden
    >
      <rect x="4" y="4" width="56" height="56" rx="4" fill="#fafafa" stroke="#e5e5e5" />
      {mood === "thinking" ? (
        <>
          <circle cx="24" cy="28" r="2.5" fill={accent} />
          <circle cx="32" cy="28" r="2.5" fill={accent} />
          <circle cx="40" cy="28" r="2.5" fill={accent} />
        </>
      ) : (
        <path
          d="M20 20 L44 44 M44 20 L20 44"
          stroke={accent}
          strokeWidth="6"
          strokeLinecap="square"
        />
      )}
      {showDot ? (
        <circle cx="52" cy="12" r="4" fill="#dc2626" className="dsx-companion-pulse" />
      ) : null}
    </svg>
  );
}

function ParticleBurst({ active, strong }: { active: boolean; strong?: boolean }) {
  if (!active) return null;
  const count = strong ? 12 : 8;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="dsx-particle" style={{ ["--i" as string]: i }} />
      ))}
    </div>
  );
}

/**
 * Lazy classroom companion host.
 * Full dance only when moment.allowDance (course complete / certificate unlock).
 */
export function ClassroomMomentHost({
  companionEnabled = true,
  celebrationsEnabled = true,
}: {
  companionEnabled?: boolean;
  celebrationsEnabled?: boolean;
}) {
  const labelId = useId();
  const [moment, setMoment] = useState<HostMoment | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = typeof window !== "undefined" && prefersReducedMotion();

  useEffect(() => {
    if (!companionEnabled) return;
    let hideTimer: number | undefined;

    const onMoment = (event: Event) => {
      const detail = (event as CustomEvent<HostMoment>).detail;
      if (!detail) return;
      if (!celebrationsEnabled && (detail.allowDance || detail.particles || detail.level === "energetic")) {
        return;
      }

      if (detail.dedupeKey) {
        try {
          const key = `dsx-moment:${detail.dedupeKey}`;
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        } catch {
          /* ignore */
        }
      }

      window.clearTimeout(hideTimer);
      setMoment(detail);
      setVisible(true);
      const ttl = reduced ? Math.min(detail.durationMs, 1200) : detail.durationMs;
      hideTimer = window.setTimeout(() => setVisible(false), ttl);
    };

    window.addEventListener(classroomMomentEventName(), onMoment);
    return () => {
      window.removeEventListener(classroomMomentEventName(), onMoment);
      window.clearTimeout(hideTimer);
    };
  }, [companionEnabled, celebrationsEnabled, reduced]);

  useEffect(() => {
    if (visible) return;
    if (!moment) return;
    const t = window.setTimeout(() => setMoment(null), 350);
    return () => window.clearTimeout(t);
  }, [visible, moment]);

  if (!companionEnabled || !moment) return null;

  const showDance = Boolean(moment.allowDance && celebrationsEnabled && !reduced);
  const showParticles = Boolean(
    moment.particles && celebrationsEnabled && !reduced && visible,
  );

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-30",
        "bottom-[5.5rem] right-3 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8",
      )}
      role="status"
      aria-live="polite"
      aria-labelledby={labelId}
    >
      <div
        className={cn(
          "pointer-events-auto relative w-[min(100vw-1.5rem,16.5rem)] border border-neutral-200 bg-white p-3 shadow-sm transition",
          visible ? "dsx-companion-enter opacity-100" : "opacity-0",
          reduced && "transition-none",
        )}
      >
        <ParticleBurst
          active={showParticles}
          strong={moment.level === "major" || moment.level === "special"}
        />
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            setMoment(null);
          }}
          className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center text-neutral-400 hover:text-neutral-800"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-3 pr-6">
          <BrandCompanionMark mood={moment.mood} level={moment.level} dancing={showDance} />
          <p id={labelId} className="font-display text-sm font-semibold leading-snug text-neutral-900">
            {moment.message}
          </p>
        </div>
      </div>
    </div>
  );
}

export function previewMoment(kind: Parameters<typeof buildClassroomMoment>[0]) {
  return buildClassroomMoment(kind);
}
