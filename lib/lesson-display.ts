import type { Lesson, Module } from "@/types/database";

export type ModuleWithLessons = Module & { lessons: Lesson[] };

const GENERIC_MODULE_TITLE = /^(imported from youtube|new module|untitled)$/i;

/** Module or lesson titles that must never appear in the student UI. */
export function isGenericImportModuleTitle(title: string) {
  return GENERIC_MODULE_TITLE.test(title.trim());
}

export function displayStudentLessonTitle(
  title: string | null | undefined,
  fallback = "Untitled lesson",
) {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || isGenericImportModuleTitle(trimmed)) return fallback;
  return trimmed;
}

/** Returns null when the module heading should be hidden from students. */
export function displayStudentModuleTitle(title: string | null | undefined): string | null {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || isGenericImportModuleTitle(trimmed)) return null;
  return trimmed;
}

function sortLessons(lessons: Lesson[]) {
  return [...lessons].sort((a, b) => a.position - b.position);
}

/** Collapse generic YouTube import module headings into one tight lesson list. */
export function normalizeOutlineModules(modules: ModuleWithLessons[]): ModuleWithLessons[] {
  const sorted = [...modules].sort((a, b) => a.position - b.position);
  const named = sorted.filter((mod) => !isGenericImportModuleTitle(mod.title));
  const generic = sorted.filter((mod) => isGenericImportModuleTitle(mod.title));

  if (generic.length === 0) return sorted;

  const mergedLessons = generic.flatMap((mod) => sortLessons(mod.lessons ?? []));
  if (mergedLessons.length === 0) return named;

  return [
    ...named,
    {
      ...generic[0],
      title: "",
      lessons: mergedLessons,
    },
  ].sort((a, b) => a.position - b.position);
}

export function formatLessonDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
