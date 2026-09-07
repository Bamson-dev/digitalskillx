import { splitCourseParagraphs, stripEmbeddedOutcomesSection } from "@/lib/course-copy-format";
import { cn } from "@/lib/utils";

/**
 * Readable multi-paragraph course description for LMS overview / sales about tabs.
 */
export function CourseDescriptionProse({
  description,
  shortDescription,
  className,
  stripOutcomes = true,
}: {
  description: string | null | undefined;
  shortDescription?: string | null;
  className?: string;
  /** When true, remove an embedded "What you'll learn" block (shown separately). */
  stripOutcomes?: boolean;
}) {
  const source = stripOutcomes ? stripEmbeddedOutcomesSection(description) : description;
  const paragraphs = splitCourseParagraphs(source);
  const short = String(shortDescription ?? "").trim();

  if (paragraphs.length === 0 && !short) return null;

  return (
    <div className={cn("space-y-4 text-[15px] leading-relaxed text-neutral-600", className)}>
      {short && (!paragraphs[0] || !paragraphs[0].startsWith(short.slice(0, 40))) ? (
        <p className="text-base font-medium text-neutral-800">{short}</p>
      ) : null}
      {paragraphs.map((p, i) => (
        <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
      ))}
    </div>
  );
}
