import { Download, ExternalLink, FileText, Link2, Paperclip } from "lucide-react";
import {
  attachmentKind,
  attachmentKindLabel,
  isExternalAttachment,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

function ResourceIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
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

export function CourseResources({ resources }: { resources: AttachmentDisplay[] }) {
  if (resources.length === 0) return null;

  return (
    <section className="px-4 sm:px-0">
      <h2 className="font-display text-sm font-bold text-neutral-900">Course downloads</h2>
      <p className="mt-1 text-xs text-neutral-500">Available on every lesson in this course.</p>
      <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
        {resources.map((resource) => {
          const kind = attachmentKind(resource.file_type, resource.file_url);
          const external = isExternalAttachment(resource.file_url);
          const href = external ? resource.file_url : `/api/resources/${resource.id}/download`;

          return (
            <li key={resource.id}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[52px] items-center gap-3 py-3"
              >
                <ResourceIcon kind={kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{resource.title}</p>
                  <p className="text-[11px] text-neutral-500">{attachmentKindLabel(kind)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                  {external ? (
                    <>
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Download <Download className="h-3.5 w-3.5" />
                    </>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
