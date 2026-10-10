export function contentFactoryJobClaimLimit(input: {
  discoveryBacklogCreated: number;
  qualified: number;
  generated: number;
}) {
  if (input.discoveryBacklogCreated > 0) return 8;
  if (input.qualified > 0 || input.generated > 0) return 6;
  return 4;
}
