export type AttachmentDisplay = {
  id: string;
  title: string;
  file_url: string;
  file_type: string | null;
};

export function isExternalAttachment(fileUrl: string) {
  return /^https?:\/\//i.test(fileUrl);
}

export function attachmentKind(fileType: string | null, fileUrl: string) {
  if (fileType === "link" || isExternalAttachment(fileUrl)) return "link";
  const type = (fileType ?? "").toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.includes("doc")) return "doc";
  if (type.includes("sheet") || type.includes("xls")) return "sheet";
  if (type.includes("slide") || type.includes("ppt")) return "slides";
  if (type.includes("zip")) return "zip";
  if (type.includes("text") || type.includes("txt")) return "text";
  return "file";
}

export function attachmentKindLabel(kind: ReturnType<typeof attachmentKind>) {
  switch (kind) {
    case "link":
      return "External link";
    case "pdf":
      return "PDF document";
    case "doc":
      return "Word document";
    case "sheet":
      return "Spreadsheet";
    case "slides":
      return "Presentation";
    case "zip":
      return "ZIP archive";
    case "text":
      return "Text file";
    default:
      return "Downloadable file";
  }
}
