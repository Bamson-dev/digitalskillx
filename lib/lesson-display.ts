import type { Lesson, Module } from "@/types/database";

export type ModuleWithLessons = Module & { lessons: Lesson[] };

const GENERIC_MODULE_TITLE = /^(imported from youtube|new module|untitled)$/i;

const UNAVAILABLE_VIDEO_TITLE = /^(private video|deleted video)$/i;

export function isGenericImportModuleTitle(title: string) {
  return GENERIC_MODULE_TITLE.test(title.trim());
}

/** Collapse repeated generic import module headings into one tight lesson list. */
export function normalizeOutlineModules(modules: ModuleWithLessons[]): ModuleWithLessons[] {
  const sorted = [...modules].sort((a, b) => a.position - b.position);

  const singleLessonGeneric = sorted.filter(
    (mod) => isGenericImportModuleTitle(mod.title) && (mod.lessons?.length ?? 0) === 1,
  );

  if (singleLessonGeneric.length >= 2) {
    const mergedLessons = singleLessonGeneric
      .flatMap((mod) => mod.lessons ?? [])
      .sort((a, b) => a.position - b.position);
    const rest = sorted.filter((mod) => !singleLessonGeneric.includes(mod));
    return [
      ...rest,
      {
        ...singleLessonGeneric[0],
        title: "",
        lessons: mergedLessons,
      },
    ].sort((a, b) => a.position - b.position);
  }

  return sorted.map((mod) => {
    if (isGenericImportModuleTitle(mod.title) && (mod.lessons?.length ?? 0) === 1) {
      return { ...mod, title: "" };
    }
    return mod;
  });
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
