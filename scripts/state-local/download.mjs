export async function download(url, timeout = 120_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchJson(url) {
  return JSON.parse((await download(url)).toString());
}
