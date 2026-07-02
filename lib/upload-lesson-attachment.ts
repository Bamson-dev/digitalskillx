import "server-only";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
]);

const ALLOWED_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/i;

export function inferAttachmentType(file: File): string {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (/word|document/i.test(file.type) || /\.docx?$/i.test(file.name)) return "doc";
  if (/sheet|excel/i.test(file.type) || /\.xlsx?$/i.test(file.name)) return "sheet";
  if (/presentation|powerpoint/i.test(file.type) || /\.pptx?$/i.test(file.name)) return "slides";
  if (file.type === "text/plain" || /\.txt$/i.test(file.name)) return "text";
  if (/zip/i.test(file.type) || /\.zip$/i.test(file.name)) return "zip";
  return "file";
}

function isAllowedFile(file: File) {
  return ALLOWED_MIME.has(file.type) || ALLOWED_EXT.test(file.name);
}

/** Upload a lesson attachment to the private-files bucket; returns storage path. */
export async function uploadLessonAttachmentFile(
  file: File,
  courseId: string,
  lessonId: string,
) {
  if (file.size <= 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_BYTES) throw new Error("File must be 10 MB or smaller.");
  if (!isAllowedFile(file)) {
    throw new Error("Upload a PDF, Word, Excel, PowerPoint, text, or ZIP file.");
  }

  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `courses/${courseId}/lessons/${lessonId}/${Date.now()}-${safeName}`;
  const body = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from("private-files").upload(path, body, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return path;
}
