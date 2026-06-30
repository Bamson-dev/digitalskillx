import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
      {icon ? (
        <div className="rounded-lg bg-brand-50 p-2 text-brand">{icon}</div>
      ) : null}
    </Card>
  );
}
