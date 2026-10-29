// "Technical details (requests this page made)": every request the SDK sends
// goes through loggedFetch (passed to connect() as clientOptions.fetchFn and to
// the geocoding client), and the PMTiles sources log each byte-range read.
// Nothing here changes a request; it only records it.

export interface LoggedRequest {
  readonly method: string;
  readonly url: string;
  readonly note?: string;
  status?: number | "failed" | "cancelled";
}

const MAX_SHOWN = 300;
const entries: LoggedRequest[] = [];
const listeners = new Set<(entries: readonly LoggedRequest[]) => void>();

export function onRequestLog(listener: (entries: readonly LoggedRequest[]) => void): void {
  listeners.add(listener);
  listener(entries);
}

export function requestLog(): readonly LoggedRequest[] {
  return entries;
}

export function logRequest(entry: LoggedRequest): LoggedRequest {
  entries.push(entry);
  if (entries.length > MAX_SHOWN) entries.splice(0, entries.length - MAX_SHOWN);
  for (const listener of listeners) listener(entries);
  return entry;
}

export function settle(entry: LoggedRequest, status: NonNullable<LoggedRequest["status"]>): void {
  entry.status = status;
  for (const listener of listeners) listener(entries);
}

function describe(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string; note?: string } {
  const request = input instanceof Request ? input : undefined;
  const url = request ? request.url : input instanceof URL ? input.toString() : String(input);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const body = init?.body;
  // Design R8: candidate queries carry the parcel polygon in a form body.
  const note = method === "POST" && typeof body === "string" && /(?:^|&)geometry=/u.test(body) ? "POST, geometry in body" : undefined;
  return { method, url, ...(note ? { note } : {}) };
}

/** A fetch that records what it sends. Same signature as window.fetch. */
export const loggedFetch: typeof fetch = async (input, init) => {
  const entry = logRequest(describe(input, init));
  try {
    const response = await fetch(input, init);
    settle(entry, response.status);
    return response;
  } catch (error) {
    settle(entry, isAbort(error, init?.signal) ? "cancelled" : "failed");
    throw error;
  }
};

/** True when a request ended because its caller cancelled it (not a failure). */
export function isAbort(error: unknown, signal?: AbortSignal | null): boolean {
  return Boolean(signal?.aborted) || (error instanceof DOMException && error.name === "AbortError");
}

export function formatRequest(entry: LoggedRequest): string {
  const status = entry.status === undefined ? "…" : String(entry.status);
  return `${entry.method.padEnd(5)} ${entry.url}${entry.note ? `  (${entry.note})` : ""}  → ${status}`;
}
