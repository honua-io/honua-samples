import { cp, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_ORIGIN_PORT, runCommand, seedFeatureService, serverEnv } from './harness.mjs';
import { startStaticServer } from '../lib/browser-lane.mjs';
import { buildStateLocalSite } from '../state-local/build-site.mjs';

async function buildSample(sample, scenario) {
  if (!await stat(path.join(sample, 'node_modules/.bin/vite')).catch(() => null)) {
    await runCommand('npm', ['ci', '--no-audit', '--no-fund'], { cwd: sample, label: 'install operations app' });
  }
  await runCommand('npm', ['test'], { cwd: sample, label: 'operations unit tests' });
  await runCommand('node', ['scripts/state-local/sdk/verify.mjs', scenario], { cwd: path.resolve(sample, '../..'), label: 'three published SDK contracts' });
  await runCommand('npm', ['run', 'build'], { cwd: sample, label: 'build operations app' });
}

export async function prepareOperationsBrowser({ sampleUrl, scenario, seeds }) {
  const env = serverEnv();
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.baseUrl).hostname)) throw new Error('Browser fixture imports require a disposable localhost server');
  const sample = fileURLToPath(sampleUrl);
  await buildSample(sample, scenario);
  const bindings = {};
  for (const [name, options] of Object.entries(seeds)) bindings[name] = await seedFeatureService(options);
  const root = await mkdtemp(path.join(tmpdir(), `${path.basename(sample)}-`));
  try {
    await cp(path.join(sample, 'dist'), path.join(root, path.basename(sample), 'app'), { recursive: true });
    await buildStateLocalSite({ repoRoot: path.resolve(sample, '../..'), siteDir: root });
    const server = await startStaticServer({ rootDir: root, port: BROWSER_ORIGIN_PORT });
    return { root, server, bindings };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function closeOperationsBrowser(browser) {
  await browser?.server.close();
  if (browser?.root) await rm(browser.root, { recursive: true, force: true });
}
