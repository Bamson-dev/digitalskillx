import { Download, ExternalLink, FileText, Link2, Paperclip } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import {
  attachmentKind,
  attachmentKindLabel,
  isExternalAttachment,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

function AttachmentIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
  const className = "h-5 w-5 shrink-0";
  switch (kind) {
    case "link":
      return <Link2 className={`${className} text-blue-600`} />;
    case "pdf":
      return <FileText className={`${className} text-red-600`} />;
    default:
      return <Paperclip className={`${className} text-slate-600`} />;
  }
}

export function LessonAttachments({ attachments }: { attachments: AttachmentDisplay[] }) {
  if (attachments.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Lesson materials"
        description="Downloads and links attached to this lesson."
      />
      <ul className="divide-y divide-[rgb(var(--border))]">
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
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <AttachmentIcon kind={kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">{attachment.title}</p>
                  <p className="text-xs text-muted">{attachmentKindLabel(kind)}</p>
                </div>
                {external ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-muted" />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
