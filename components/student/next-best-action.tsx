import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, ClipboardList, PlayCircle } from "lucide-react";
import type { NextBestActionKind } from "@/lib/classroom-next-action";

export type { NextBestActionKind } from "@/lib/classroom-next-action";
export { resolveNextBestAction } from "@/lib/classroom-next-action";

export function NextBestAction({
  kind,
  href,
  label,
  detail,
}: {
  kind: NextBestActionKind;
  href: string;
  label: string;
  detail?: string;
}) {
  const Icon =
    kind === "take_quiz"
      ? ClipboardList
      : kind === "view_certificate"
        ? Award
        : kind === "mark_complete"
          ? CheckCircle2
          : PlayCircle;

  return (
    <section className="border-y border-neutral-200 bg-neutral-50 px-4 py-5 sm:border sm:bg-white sm:px-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Next step
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-neutral-950">{label}</p>
          {detail ? <p className="mt-1 text-sm text-neutral-600">{detail}</p> : null}
        </div>
        <Link
          href={href}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Icon className="h-4 w-4" />
          {label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
