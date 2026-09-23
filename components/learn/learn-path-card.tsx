import Link from "next/link";
import { LearnCover } from "@/components/learn/learn-cover";
import { formatLearningMinutes } from "@/lib/content-factory/library-shared";

export type LearnPathCardData = {
  slug: string;
  title: string;
  short_description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  artwork_public_url?: string | null;
  artwork_storage_path?: string | null;
  artwork_status?: string | null;
  creator_name?: string | null;
  estimated_duration_seconds?: number | null;
  certificate_enabled?: boolean | null;
};

export function LearnPathCard({ path }: { path: LearnPathCardData }) {
  const duration = formatLearningMinutes(path.estimated_duration_seconds);
  return (
    <li className="min-w-0 rounded-2xl border border-app bg-white overflow-hidden">
      <Link
        href={`/learn/${path.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <LearnCover
          path={{
            id: path.slug,
            category: path.category,
            artwork_public_url: path.artwork_public_url,
            artwork_storage_path: path.artwork_storage_path,
            artwork_status: path.artwork_status,
          }}
          className="aspect-[16/9] w-full"
        />
        <div className="p-4">
          <h3 className="break-words font-semibold text-neutral-900">{path.title}</h3>
          {path.short_description ? (
            <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{path.short_description}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            {path.category ? <span>{path.category}</span> : null}
            {path.difficulty ? <span>{path.category ? " · " : ""}{path.difficulty}</span> : null}
            {duration ? <span> · {duration}</span> : null}
            {path.creator_name ? <span> · {path.creator_name}</span> : null}
            {path.certificate_enabled ? <span> · Certificate available</span> : null}
          </p>
        </div>
      </Link>
    </li>
  );
}
