export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoff?: boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = opts;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const wait = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        console.warn(
          `[retry] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. Retrying in ${wait}ms...`
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastError;
}
