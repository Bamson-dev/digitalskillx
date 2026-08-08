"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Short score reveal — respects prefers-reduced-motion. */
export function QuizScoreReveal({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setDisplay(score);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(score * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, reduced]);

  return (
    <span className={cn("tabular-nums", className)} aria-label={`${score} percent`}>
      {display}%
    </span>
  );
}
