import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  LIBRARY_PAGE_SIZE,
  categoryMatchesFilter,
  type LibraryCategoryId,
} from "@/lib/content-factory/library-shared";
import {
  MEDIUM_MAX_SECONDS,
  SHORT_MAX_SECONDS,
  parseLearnDiscoverySearchParams,
  pathMatchesCertificateFilter,
  sortDiscoverablePaths,
  type CertificateFilter,
  type LearnDiscoveryParams,
} from "@/lib/learn-discovery/discovery-shared";
import type { PublishedLibraryPath } from "@/lib/content-factory/learning-paths";

export type DiscoverLibraryPath = PublishedLibraryPath & {
  description?: string | null;
  learning_objectives?: string[] | null;
  estimated_duration_seconds?: number | null;
  certificate_enabled?: boolean | null;
  certificate_pricing_mode?: string | null;
  updated_at?: string | null;
};

const DISCOVERY_SELECT =
  "id, slug, title, short_description, description, category, difficulty, tags, learning_objectives, artwork_public_url, artwork_storage_path, artwork_status, quality_score, published_at, updated_at, creator_profile_id, estimated_duration_seconds, certificate_enabled, certificate_pricing_mode";

const DISCOVERY_SELECT_LEGACY =
  "id, slug, title, short_description, category, difficulty, tags, artwork_public_url, quality_score, published_at, creator_profile_id";

function needsMemoryCategory(category: LibraryCategoryId) {
  return category !== "all";
}

export async function listDiscoverableLearningLibrary(
  client: SupabaseClient<Database>,
  rawParams: {
    q?: string | null;
    category?: string | null;
    difficulty?: string | null;
    duration?: string | null;
    certificate?: string | null;
    sort?: string | null;
    page?: string | number | null;
    pageSize?: number;
  },
): Promise<{
  paths: DiscoverLibraryPath[];
  page: number;
  pageSize: number;
  total: number;
  params: LearnDiscoveryParams;
}> {
  const params = parseLearnDiscoverySearchParams({
    q: rawParams.q,
    category: rawParams.category,
    difficulty: rawParams.difficulty,
    duration: rawParams.duration,
    certificate: rawParams.certificate,
    sort: rawParams.sort,
    page: rawParams.page != null ? String(rawParams.page) : undefined,
  });
  const pageSize = rawParams.pageSize ?? LIBRARY_PAGE_SIZE;
  const from = (params.page - 1) * pageSize;
  const to = from + pageSize - 1;
  const memoryCategory = needsMemoryCategory(params.category);

  let query = client
    .from("learning_paths")
    .select(DISCOVERY_SELECT, { count: "exact" })
    .eq("status", "published");

  if (params.q) {
    const { data: creators, error: creatorSearchError } = await client
      .from("creator_profiles")
      .select("id")
      .ilike("display_name", `%${params.q}%`)
      .limit(20);
    const creatorIds = creatorSearchError ? [] : (creators ?? []).map((row) => row.id);
    const parts = [
      `title.ilike.%${params.q}%`,
      `short_description.ilike.%${params.q}%`,
      `category.ilike.%${params.q}%`,
      `description.ilike.%${params.q}%`,
    ];
    if (creatorIds.length) parts.push(`creator_profile_id.in.(${creatorIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  if (params.difficulty) query = query.eq("difficulty", params.difficulty);
  if (params.duration === "short") {
    query = query.gt("estimated_duration_seconds", 0).lt("estimated_duration_seconds", SHORT_MAX_SECONDS);
  } else if (params.duration === "medium") {
    query = query
      .gte("estimated_duration_seconds", SHORT_MAX_SECONDS)
      .lt("estimated_duration_seconds", MEDIUM_MAX_SECONDS);
  } else if (params.duration === "long") {
    query = query.gte("estimated_duration_seconds", MEDIUM_MAX_SECONDS);
  }

  if (params.certificate === "available") {
    query = query.eq("certificate_enabled", true);
  } else if (params.certificate === "free") {
    query = query.eq("certificate_enabled", true).eq("certificate_pricing_mode", "free");
  } else if (params.certificate === "paid") {
    query = query.eq("certificate_enabled", true).neq("certificate_pricing_mode", "free");
  }

  if (params.sort === "shortest") {
    query = query
      .order("estimated_duration_seconds", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
  } else if (params.sort === "longest") {
    query = query
      .order("estimated_duration_seconds", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
  } else if (params.sort === "updated") {
    query = query.order("updated_at", { ascending: false }).order("id", { ascending: true });
  } else {
    query = query.order("published_at", { ascending: false }).order("id", { ascending: true });
  }

  const bounded = memoryCategory ? query.limit(300) : query.range(from, to);
  let { data, error, count } = await bounded;

  if (error && /column|does not exist/i.test(error.message)) {
    let legacy = client
      .from("learning_paths")
      .select(DISCOVERY_SELECT_LEGACY, { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (params.q) {
      legacy = legacy.or(
        [
          `title.ilike.%${params.q}%`,
          `short_description.ilike.%${params.q}%`,
          `category.ilike.%${params.q}%`,
        ].join(","),
      );
    }
    if (params.difficulty) legacy = legacy.eq("difficulty", params.difficulty);
    const legacyBounded = memoryCategory ? legacy.limit(300) : legacy.range(from, to);
    const legacyRes = await legacyBounded;
    data = legacyRes.data as typeof data;
    error = legacyRes.error;
    count = legacyRes.count;
  }
  if (error) throw new Error(error.message);

  let paths = (data ?? []) as DiscoverLibraryPath[];
  if (memoryCategory) {
    paths = paths.filter((row) => categoryMatchesFilter(row.category, params.category));
  }
  // Safety filter for certificate / duration if columns missing on legacy path
  paths = paths.filter((row) => pathMatchesCertificateFilter(row, params.certificate as CertificateFilter));
  if (params.duration) {
    paths = paths.filter((row) => {
      const s = row.estimated_duration_seconds;
      if (s == null) return false;
      if (params.duration === "short") return s > 0 && s < SHORT_MAX_SECONDS;
      if (params.duration === "medium") return s >= SHORT_MAX_SECONDS && s < MEDIUM_MAX_SECONDS;
      return s >= MEDIUM_MAX_SECONDS;
    });
  }

  paths = sortDiscoverablePaths(paths, params.sort);
  const total = memoryCategory || params.duration ? paths.length : count ?? paths.length;
  if (memoryCategory || params.duration) {
    paths = paths.slice(from, to + 1);
  }

  const creatorIds = [
    ...new Set(paths.map((row) => row.creator_profile_id).filter((id): id is string => Boolean(id))),
  ];
  if (creatorIds.length) {
    const { data: creators } = await client
      .from("creator_profiles")
      .select("id, display_name")
      .in("id", creatorIds);
    const names = new Map((creators ?? []).map((row) => [row.id, row.display_name]));
    paths = paths.map((row) => ({
      ...row,
      creator_name: row.creator_profile_id ? names.get(row.creator_profile_id) ?? null : null,
    }));
  }

  return { paths, page: params.page, pageSize, total, params };
}

export type {
  LearnDiscoveryParams,
  LearnDifficulty,
  DurationBucket,
  CertificateFilter,
  LearnSort,
} from "@/lib/learn-discovery/discovery-shared";
