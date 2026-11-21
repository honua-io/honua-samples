// Public county/state servers fail some queries at random; a full snapshot is hundreds of pages.
const attempts = 8;
const retryableStatus = (status) => status === 429 || status >= 500;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class SourceError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

async function withRetry(operation, { wait = pause } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || error.retryable === false) throw error;
      await wait(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
    }
  }
}

async function downloadOnce(url, timeout) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new SourceError(`Source returned HTTP ${response.status}: ${url}`, retryableStatus(response.status));
  return Buffer.from(await response.arrayBuffer());
}

export async function download(url, timeout = 120_000, options) {
  return withRetry(() => downloadOnce(url, timeout), options);
}

// ArcGIS servers report transient query failures as HTTP 200 with {"error":{"code":500}}.
export async function fetchJson(url, timeout, options) {
  return withRetry(async () => {
    const data = JSON.parse((await downloadOnce(url, timeout ?? 120_000)).toString());
    if (retryableStatus(Number(data?.error?.code))) throw new SourceError(`Source query failed: ${data.error.message}`, true);
    return data;
  }, options);
}
