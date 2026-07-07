export type LessonImportSource =
  | "youtube_playlist"
  | "youtube_video"
  | "vimeo"
  | "wistia"
  | "loom";

export type ImportSkipReason = {
  videoId: string | null;
  title: string;
  reason: string;
};
