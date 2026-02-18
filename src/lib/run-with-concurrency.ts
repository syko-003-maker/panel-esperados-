/**
 * Run async tasks with concurrency limit
 * @param items - Array of items to process
 * @param worker - Async function that processes each item
 * @param options - { concurrency: number }
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: { concurrency: number }
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  const runners = Array.from(
    { length: Math.max(1, options.concurrency) },
    async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        results[idx] = await worker(items[idx], idx);
      }
    }
  );

  await Promise.all(runners);
  return results;
}
