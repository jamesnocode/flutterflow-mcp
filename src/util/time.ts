export function nowIso(): string {
  return new Date().toISOString();
}

export function isSnapshotStale(refreshedAt: string, staleMinutes: number): boolean {
  const refreshTime = Date.parse(refreshedAt);
  if (Number.isNaN(refreshTime)) {
    return true;
  }

  const deltaMs = Date.now() - refreshTime;
  return deltaMs > staleMinutes * 60_000;
}
