/** Feature flag for Sales Page importer / admin surface. Default: enabled (opt-out). */
export function salesPageImportEnabled(): boolean {
  const raw = (process.env.SALES_PAGE_IMPORT_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}
