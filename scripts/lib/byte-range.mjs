// Parses a single "bytes=start-[end]" request against a resource of `size`
// bytes; returns null when the range is malformed or unsatisfiable (HTTP 416).
export function parseByteRange(header, size) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}
