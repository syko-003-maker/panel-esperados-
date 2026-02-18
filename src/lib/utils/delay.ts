/**
 * Simple delay utility for rate limiting and backoff
 */
export function createDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
