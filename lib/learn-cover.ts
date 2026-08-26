/** Client-safe Learn cover URL helpers. */

export function learnArtworkProxyPath(pathId: string) {
  return `/api/learn/artwork/${pathId}`;
}

export function resolveLearnCoverUrl(path: {
  id: string;
  artwork_public_url?: string | null;
  artwork_storage_path?: string | null;
  artwork_status?: string | null;
}): string | null {
  const url = path.artwork_public_url?.trim();
  if (url) return url;
  if (path.artwork_storage_path?.trim()) return learnArtworkProxyPath(path.id);
  return null;
}

export function learnCoverNeedsCategoryFallback(path: {
  artwork_public_url?: string | null;
  artwork_storage_path?: string | null;
  artwork_status?: string | null;
}): boolean {
  if (path.artwork_status === "category_fallback" || path.artwork_status === "missing") return true;
  return !path.artwork_public_url?.trim() && !path.artwork_storage_path?.trim();
}
