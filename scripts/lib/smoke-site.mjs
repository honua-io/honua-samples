import { startStaticServer } from './browser-lane.mjs';

export async function startSmokeSite({ rootDir, baseUrl }) {
  if (!baseUrl) return startStaticServer({ rootDir, port: 0 });
  const target = new URL(baseUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
      || target.search || target.hash || target.pathname !== '/') {
    throw new Error('Smoke base URL must be an HTTP(S) site origin without credentials, query or fragment');
  }
  return { url: target.origin, close: async () => {} };
}
