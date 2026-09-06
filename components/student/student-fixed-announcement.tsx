"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Megaphone, Pin, X } from "lucide-react";
import type { PlatformAnnouncement } from "@/lib/platform-announcements-shared";
import { cn } from "@/lib/utils";

const TYPE_STYLES: Record<
  PlatformAnnouncement["type"],
  { wrap: string; icon: typeof Info; label: string }
> = {
  information: {
    wrap: "border-sky-200 bg-sky-50 text-sky-950",
    icon: Info,
    label: "Information",
  },
  important: {
    wrap: "border-brand/30 bg-brand/5 text-neutral-950",
    icon: Megaphone,
    label: "Important",
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: CheckCircle2,
    label: "Success",
  },
  warning: {
    wrap: "border-amber-300 bg-amber-50 text-amber-950",
    icon: AlertTriangle,
    label: "Warning",
  },
};

function dismissKey(id: string) {
  return `dsx-announcement-dismissed:${id}`;
}

/**
 * Fixed/pinned student announcement banner.
 * Dismiss is session-only (sessionStorage) — admin still controls active state.
 */
export function StudentFixedAnnouncement({
  announcement,
}: {
  announcement: PlatformAnnouncement;
}) {
  const [hidden, setHidden] = useState(true);
  const style = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.information;
  const Icon = style.icon;

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(dismissKey(announcement.id)) === "1");
    } catch {
      setHidden(false);
    }
  }, [announcement.id]);

  if (hidden) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-xl border px-4 py-4 sm:px-5 sm:py-5",
        style.wrap,
      )}
    >
      <div className="flex gap-3 pr-8">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
              {style.label}
            </p>
            {announcement.is_fixed ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                <Pin className="h-3 w-3" aria-hidden />
                Fixed
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 font-display text-lg font-bold leading-snug sm:text-xl">
            {announcement.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed opacity-90 whitespace-pre-wrap">
            {announcement.message}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(dismissKey(announcement.id), "1");
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        className="absolute right-2 top-2 inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-current/70 hover:bg-black/5 hover:text-current"
        aria-label="Dismiss announcement for this session"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}

export function StudentFixedAnnouncements({
  announcements,
}: {
  announcements: PlatformAnnouncement[];
}) {
  if (!announcements.length) return null;
  const primary = announcements[0];
  const rest = announcements.slice(1, 3);

  return (
    <section aria-label="Platform announcements" className="space-y-3">
      <StudentFixedAnnouncement announcement={primary} />
      {rest.map((item) => (
        <StudentFixedAnnouncement key={item.id} announcement={item} />
      ))}
    </section>
  );
}
