/** Minimal safe markdown-ish renderer for authority guides (no HTML passthrough). */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\((\/[a-zA-Z0-9/_?&=%#.-]*)\)/g, '<a href="$2" class="text-brand hover:underline">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-neutral-100 px-1">$1</code>');
  return out;
}

export function AuthorityMarkdown({ markdown }: { markdown: string }) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const blocks: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      blocks.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      blocks.push(`<h3 class="mt-6 text-base font-semibold">${inlineFormat(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      blocks.push(`<h2 class="mt-8 text-lg font-semibold">${inlineFormat(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeList();
      blocks.push(`<h2 class="mt-8 text-xl font-semibold">${inlineFormat(line.replace(/^#\s+/, ""))}</h2>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        blocks.push('<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">');
        listOpen = true;
      }
      blocks.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      closeList();
      blocks.push(`<p class="mt-2 text-sm text-neutral-700">${inlineFormat(line)}</p>`);
      continue;
    }
    closeList();
    blocks.push(`<p class="mt-3 text-sm leading-relaxed text-neutral-700">${inlineFormat(line)}</p>`);
  }
  closeList();

  return (
    <div
      className="authority-md max-w-none"
      dangerouslySetInnerHTML={{ __html: blocks.join("\n") }}
    />
  );
}
