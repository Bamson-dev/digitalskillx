"use client";

import { SECTION_LIBRARY } from "@/lib/sales-pages/types";
import type { SalesPageSectionType } from "@/lib/sales-pages/types";
import { Button } from "@/components/ui/button";

export function SectionLibrary({
  onAdd,
  disabled,
}: {
  onAdd: (type: SalesPageSectionType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SECTION_LIBRARY.filter((s) => s.type !== "unsupported").map((item) => (
        <button
          key={item.type}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(item.type)}
          className="rounded-lg border border-app bg-white px-3 py-2 text-left transition hover:border-brand disabled:opacity-50"
        >
          <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
          <p className="mt-0.5 text-xs text-muted">{item.description}</p>
        </button>
      ))}
    </div>
  );
}

export function SectionToolbar({
  index,
  total,
  hidden,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleHidden,
  onDelete,
  disabled,
}: {
  index: number;
  total: number;
  hidden?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" disabled={disabled || index === 0} onClick={onMoveUp}>
        Up
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || index >= total - 1}
        onClick={onMoveDown}
      >
        Down
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onDuplicate}>
        Duplicate
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onToggleHidden}>
        {hidden ? "Show" : "Hide"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
