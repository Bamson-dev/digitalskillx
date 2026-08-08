import { Download, ExternalLink, FileText, Link2, Paperclip } from "lucide-react";
import {
  attachmentKind,
  attachmentKindLabel,
  isExternalAttachment,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

function AttachmentIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
  const className = "h-4 w-4 shrink-0 text-neutral-500";
  switch (kind) {
    case "link":
      return <Link2 className={className} />;
    case "pdf":
      return <FileText className={className} />;
    default:
      return <Paperclip className={className} />;
  }
}

export function LessonAttachments({ attachments }: { attachments: AttachmentDisplay[] }) {
  if (attachments.length === 0) return null;

  return (
    <section className="px-4 sm:px-0">
      <h2 className="font-display text-sm font-bold text-neutral-900">Lesson materials</h2>
      <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
        {attachments.map((attachment) => {
          const kind = attachmentKind(attachment.file_type, attachment.file_url);
          const external = isExternalAttachment(attachment.file_url);
          const href = external ? attachment.file_url : `/api/resources/${attachment.id}/download`;

          return (
            <li key={attachment.id}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[52px] items-center gap-3 py-3"
              >
                <AttachmentIcon kind={kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{attachment.title}</p>
                  <p className="text-[11px] text-neutral-500">{attachmentKindLabel(kind)}</p>
                </div>
                {external ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-neutral-400" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-neutral-400" />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
