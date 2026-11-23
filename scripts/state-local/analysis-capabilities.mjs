// Reads the installed server's capability manifest before an analysis capture.
// The server reports limits.analysis.h3Available (false when the database has no h3-pg) and maxH3CellsPerQuery.

export const manifestPath = '/api/v1/capabilities/manifest';

export function h3Prerequisite(serverManifest, cellLimit) {
  const analysis = serverManifest?.limits?.analysis;
  if (!analysis || typeof analysis !== 'object') throw new Error('H3: the server capability manifest has no limits.analysis section; cannot verify the cell limit');
  if (analysis.h3Available === false) {
    return { record: false, reason: 'the server reports h3Available=false (no h3-pg extension in its database); H3 was not recorded' };
  }
  if (analysis.maxH3CellsPerQuery !== cellLimit) {
    throw new Error(`H3: cellLimit ${cellLimit} does not match the server's maxH3CellsPerQuery ${analysis.maxH3CellsPerQuery}`);
  }
  return { record: true };
}

export async function readServerManifest(base, headers, fetcher = fetch) {
  const response = await fetcher(new URL(manifestPath, base).href, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`H3: capability manifest returned HTTP ${response.status}; H3 needs it to verify the cell limit. Set HONUA_ANALYSIS_API_KEY to an admin key, or remove h3 from the input manifest`);
  }
  return response.json();
}
