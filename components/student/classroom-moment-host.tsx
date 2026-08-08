"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import {
  buildClassroomMoment,
  classroomMomentEventName,
  type ClassroomMoment,
  type CompanionMood,
} from "@/lib/classroom-engagement";
import { cn } from "@/lib/utils";

type HostMoment = ClassroomMoment & { dedupeKey?: string };

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Brand mark companion — geometric X mark, not a cartoon mascot. */
function BrandCompanionMark({
  mood,
  dancing,
}: {
  mood: CompanionMood;
  dancing: boolean;
}) {
  const accent =
    mood === "incorrect"
      ? "#a3a3a3"
      : mood === "certificate" || mood === "celebration"
        ? "#dc2626"
        : "#171717";

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn(
        "h-11 w-11 sm:h-12 sm:w-12",
        dancing && !prefersReducedMotion() && "dsx-companion-dance",
        mood === "correct" && "dsx-companion-nod",
        mood === "incorrect" && "dsx-companion-soft",
      )}
      aria-hidden
    >
      <rect x="4" y="4" width="56" height="56" rx="4" fill="#fafafa" stroke="#e5e5e5" />
      <path
        d="M20 20 L44 44 M44 20 L20 44"
        stroke={accent}
        strokeWidth="6"
        strokeLinecap="square"
      />
      {(mood === "celebration" || mood === "certificate") && (
        <circle cx="52" cy="12" r="4" fill="#dc2626" className="dsx-companion-pulse" />
      )}
    </svg>
  );
}

function ParticleBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="dsx-particle" style={{ ["--i" as string]: i }} />
      ))}
    </div>
  );
}

/**
 * Lazy classroom companion host.
 * Dance only when moment.allowDance is true (course complete / certificate unlock).
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

    const onMoment = (event: Event) => {
      const detail = (event as CustomEvent<HostMoment>).detail;
      if (!detail) return;
      if (!celebrationsEnabled && (detail.allowDance || detail.particles)) return;

      if (detail.dedupeKey) {
        try {
          const key = `dsx-moment:${detail.dedupeKey}`;
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        } catch {
          /* ignore */
        }
      }

      setMoment(detail);
      setVisible(true);
      const ttl = reduced ? Math.min(detail.durationMs, 1200) : detail.durationMs;
      const t = window.setTimeout(() => setVisible(false), ttl);
      return () => window.clearTimeout(t);
    };

    window.addEventListener(classroomMomentEventName(), onMoment);
    return () => window.removeEventListener(classroomMomentEventName(), onMoment);
  }, [companionEnabled, celebrationsEnabled, reduced]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setMoment(null), 400);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!companionEnabled || !moment) return null;

  const showDance = Boolean(moment.allowDance && celebrationsEnabled && !reduced);
  const showParticles = Boolean(moment.particles && celebrationsEnabled && !reduced && visible);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-30",
        /* Keep clear of video + sticky mobile lesson bar */
        "bottom-[5.5rem] right-3 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8",
      )}
      role="status"
      aria-live="polite"
      aria-labelledby={labelId}
    >
      <div
        className={cn(
          "pointer-events-auto relative w-[min(100vw-1.5rem,16rem)] border border-neutral-200 bg-white p-3 shadow-sm transition",
          visible ? "dsx-companion-enter opacity-100" : "opacity-0",
          reduced && "transition-none",
        )}
      >
        <ParticleBurst active={showParticles} />
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
          <BrandCompanionMark mood={moment.mood} dancing={showDance} />
          <p id={labelId} className="font-display text-sm font-semibold leading-snug text-neutral-900">
            {moment.message}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Fire a local demo-safe moment builder for tests. */
export function previewMoment(kind: Parameters<typeof buildClassroomMoment>[0]) {
  return buildClassroomMoment(kind);
}
