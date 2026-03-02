export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const cappedLimit = Math.max(1, Math.min(limit, 16));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(cappedLimit, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }

      const item = items[current];
      if (item === undefined) {
        return;
      }

      results[current] = await worker(item, current);
    }
  });

  await Promise.all(runners);
  return results;
}
