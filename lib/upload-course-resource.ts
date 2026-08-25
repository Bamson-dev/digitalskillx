import "server-only";
import { getAdminStorageClient } from "@/lib/admin-storage";
import { getContaboIntegrationStatus, getStorageService } from "@/lib/storage";
import { inferAttachmentType } from "@/lib/upload-lesson-attachment";

export { inferAttachmentType };

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

function isAllowedFile(file: File) {
  if (ALLOWED_EXT.test(file.name)) return true;
  if (!file.type) return false;
  return ALLOWED_MIME.has(file.type);
}

/** Upload a course-level resource to Contabo (when configured) or Supabase private-files. */
export async function uploadCourseResourceFile(file: File, courseId: string) {
  if (file.size <= 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_BYTES) throw new Error("File must be 25 MB or smaller.");
  if (!isAllowedFile(file)) {
    throw new Error("Upload a PDF, Word, Excel, PowerPoint, text, or ZIP file.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `courses/${courseId}/resources/${Date.now()}-${safeName}`;
  const body = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const contabo = getContaboIntegrationStatus();
  if (contabo.configured) {
    try {
      const storage = getStorageService();
      await storage.upload({ path, body, contentType });
      return path;
    } catch (err) {
      console.error("[course-resource] Contabo upload failed, trying Supabase:", err);
    }
  }

  const supabase = await getAdminStorageClient();
  const { error } = await supabase.storage.from("private-files").upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return path;
}
