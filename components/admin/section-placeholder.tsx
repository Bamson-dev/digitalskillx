import { Card } from "@/components/ui/card";

export function SectionPlaceholder({
  title,
  description,
  phase,
  bullets,
}: {
  title: string;
  description: string;
  phase: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Card>
        <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {phase}
        </span>
        <p className="mt-3 text-sm font-medium">Planned for this section:</p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          {bullets.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
