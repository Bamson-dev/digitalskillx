import { Download, ExternalLink, FileText, Link2, Paperclip } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import {
  attachmentKind,
  attachmentKindLabel,
  isExternalAttachment,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

function ResourceIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
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

export function CourseResources({ resources }: { resources: AttachmentDisplay[] }) {
  if (resources.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Course downloads"
        description="Resources for this course — available on every lesson."
      />
      <ul className="divide-y divide-[rgb(var(--border))]">
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
                className="flex min-h-[44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <ResourceIcon kind={kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">{resource.title}</p>
                  <p className="text-xs text-muted">{attachmentKindLabel(kind)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
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
    </Card>
  );
}
