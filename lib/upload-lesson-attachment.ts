import "server-only";
import { getAdminStorageClient } from "@/lib/admin-storage";
import { getContaboIntegrationStatus, getStorageService } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;

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
  "application/octet-stream",
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
  if (ALLOWED_EXT.test(file.name)) return true;
  if (!file.type) return false;
  return ALLOWED_MIME.has(file.type);
}

/**
 * Upload a lesson attachment to Contabo (when configured) or Supabase private-files.
 * Returns a storage path used by /api/resources/[id]/download.
 */
export async function uploadLessonAttachmentFile(
  file: File,
  courseId: string,
  lessonId: string,
) {
  if (file.size <= 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_BYTES) throw new Error("File must be 25 MB or smaller.");
  if (!isAllowedFile(file)) {
    throw new Error("Upload a PDF, Word, Excel, PowerPoint, text, or ZIP file.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `courses/${courseId}/lessons/${lessonId}/${Date.now()}-${safeName}`;
  const body = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const contabo = getContaboIntegrationStatus();
  if (contabo.configured) {
    try {
      const storage = getStorageService();
      await storage.upload({
        path,
        body,
        contentType,
      });
      return path;
    } catch (err) {
      console.error("[lesson-attachment] Contabo upload failed, trying Supabase:", err);
    }
  }

  const supabase = await getAdminStorageClient();
  const { error } = await supabase.storage.from("private-files").upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "Storage bucket private-files is missing. Open System health or re-save — the app creates it automatically.",
      );
    }
    if (/row-level security/i.test(error.message)) {
      throw new Error("Upload blocked by storage permissions. Use a service-role key on the server.");
    }
    throw new Error(error.message);
  }

  return path;
}
