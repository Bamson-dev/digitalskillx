export type BrokenLessonRow = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  youtubeVideoId: string | null;
  flags: string[];
};

const GENERIC_VIDEO_TITLE = /^video [\w-]{11}$/i;

const UNAVAILABLE_VIDEO_TITLE = /^(private video|deleted video)$/i;

const GENERIC_IMPORT_LABEL = /^(imported from youtube|new module|untitled)$/i;

const MUSIC_VIDEO_HINT =
  /\b(official\s+(music\s+)?video|lyrics?\s+video|\(mv\)|\(m\/v\))\b/i;

const REPORTED_UNRELATED_PATTERNS = [/gangnam\s*style/i, /^psy\s[-–]/i];

export function getBrokenLessonFlags(lesson: {
  title: string;
  youtube_video_id?: string | null;
}): string[] {
  const flags: string[] = [];
  const title = lesson.title?.trim() ?? "";

  if (!title) {
    flags.push("empty title");
    return flags;
  }

  if (GENERIC_VIDEO_TITLE.test(title)) flags.push("generic import title");
  if (GENERIC_IMPORT_LABEL.test(title)) flags.push("generic import label");
  if (/^untitled(\s+video)?$/i.test(title)) flags.push("untitled");
  if (UNAVAILABLE_VIDEO_TITLE.test(title)) flags.push("unavailable video");
  if (lesson.youtube_video_id && MUSIC_VIDEO_HINT.test(title)) {
    flags.push("possible unrelated music video");
  }
  if (REPORTED_UNRELATED_PATTERNS.some((pattern) => pattern.test(title))) {
    flags.push("likely unrelated import");
  }

  return flags;
}

export function isBrokenLesson(lesson: {
  title: string;
  youtube_video_id?: string | null;
}): boolean {
  return getBrokenLessonFlags(lesson).length > 0;
}
