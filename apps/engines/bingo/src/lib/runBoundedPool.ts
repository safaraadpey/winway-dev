/**
 * Run async work over items with a bounded number of concurrent workers.
 * Not unbounded Promise.all — workers pull from a shared index until exhausted.
 */
export async function runBoundedPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
}
