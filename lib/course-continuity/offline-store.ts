/** Client-side IndexedDB snapshot so recently opened courses stay playable offline. */

export const CONTINUITY_DB = "digitalskillx-continuity";
export const CONTINUITY_STORE = "courses";
export const CONTINUITY_DB_VERSION = 1;

export type ContinuityLessonSnapshot = {
  id: string;
  title: string;
  position: number;
  videoUrl: string | null;
  videoProvider: string | null;
  durationSeconds: number | null;
};

export type ContinuityModuleSnapshot = {
  id: string;
  title: string;
  position: number;
  lessons: ContinuityLessonSnapshot[];
};

export type ContinuityCourseSnapshot = {
  id: string;
  title: string;
  updatedAt: string;
  modules: ContinuityModuleSnapshot[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONTINUITY_DB, CONTINUITY_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CONTINUITY_STORE)) {
        db.createObjectStore(CONTINUITY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_open_failed"));
  });
}

export async function saveContinuityCourse(
  snapshot: ContinuityCourseSnapshot,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONTINUITY_STORE, "readwrite");
    tx.objectStore(CONTINUITY_STORE).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_put_failed"));
  });
  db.close();
}

export async function listContinuityCourses(): Promise<ContinuityCourseSnapshot[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const rows = await new Promise<ContinuityCourseSnapshot[]>((resolve, reject) => {
    const tx = db.transaction(CONTINUITY_STORE, "readonly");
    const req = tx.objectStore(CONTINUITY_STORE).getAll();
    req.onsuccess = () => resolve((req.result as ContinuityCourseSnapshot[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_list_failed"));
  });
  db.close();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getContinuityCourse(
  courseId: string,
): Promise<ContinuityCourseSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const row = await new Promise<ContinuityCourseSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(CONTINUITY_STORE, "readonly");
    const req = tx.objectStore(CONTINUITY_STORE).get(courseId);
    req.onsuccess = () => resolve((req.result as ContinuityCourseSnapshot) ?? null);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_get_failed"));
  });
  db.close();
  return row;
}
