import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOperationsDependencies } from '../../../scripts/browser-verification/state-local.mjs';
import { buildStateLocalSite } from '../../../scripts/state-local/build-site.mjs';

import { syntheticDepthReceipt, DEPTH_FILE } from './depth-receipt.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function prepareDepthBrowser() {
  await ensureOperationsDependencies(ROOT);
  const { build, preview } = await import('vite');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-depth-browser-'));
  const bytes = await readFile(new URL('./fixtures/depth.tif', import.meta.url));
  const file = DEPTH_FILE;
  await writeFile(path.join(directory, file), bytes);
  const receipt = syntheticDepthReceipt(bytes);
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt));
  const previous = process.env.HONUA_DEPTH_DIR;
  let server;
  try {
    process.env.HONUA_DEPTH_DIR = directory;
    await build({ root: ROOT, build: { outDir: path.join(directory, 'dist'), emptyOutDir: true } });
    await buildStateLocalSite({ repoRoot: path.resolve(ROOT, '../..'), siteDir: path.join(directory, 'dist') });
    server = await preview({ root: ROOT, build: { outDir: path.join(directory, 'dist') }, preview: { host: '127.0.0.1', port: 0 } });
    return { url: server.resolvedUrls.local[0], close: async () => {
      await new Promise((resolve) => server.httpServer.close(resolve));
      await rm(directory, { recursive: true, force: true });
    } };
  } catch (error) {
    server?.httpServer.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (previous === undefined) delete process.env.HONUA_DEPTH_DIR;
    else process.env.HONUA_DEPTH_DIR = previous;
  }
}
