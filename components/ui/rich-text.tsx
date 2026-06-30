"use client";

import { useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight dependency-free rich text editor built on contentEditable.
 * Emits HTML through a hidden input named `name` so it works inside forms /
 * server actions. (Can be swapped for TipTap later without changing callers.)
 */
export function RichText({
  name,
  defaultValue = "",
  placeholder = "Write something…",
  className,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);

  function exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    if (ref.current) setHtml(ref.current.innerHTML);
  }

  return (
    <div className={cn("rounded-lg border border-app bg-card", className)}>
      <div className="flex items-center gap-1 border-b border-app p-1.5">
        <ToolbarButton onClick={() => exec("bold")} label="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} label="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("insertUnorderedList")}
          label="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("insertOrderedList")}
          label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) exec("createLink", url);
          }}
          label="Link"
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
        className="prose-sm min-h-[140px] px-3 py-2 text-sm outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)]"
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1.5 text-muted hover:bg-brand-50 hover:text-foreground"
    >
      {children}
    </button>
  );
}
