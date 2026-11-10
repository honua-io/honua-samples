// The standalone sample owns shared assets so clean sample exports remain buildable.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function buildStateLocalSite({ repoRoot, siteDir }) {
  const source = path.join(repoRoot, 'scripts/state-local/site');
  const sample = path.join(repoRoot, 'samples/county-parcel-viewer');
  const output = path.join(siteDir, 'state-local');
  const assets = path.join(output, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(path.join(source, 'index.html'), path.join(output, 'index.html'));
  await cp(path.join(source, 'overview.css'), path.join(assets, 'overview.css'));
  await cp(path.join(sample, 'src/tokens.css'), path.join(assets, 'tokens.css'));
  const shared = await readFile(path.join(sample, 'src/shared.css'), 'utf8');
  await writeFile(path.join(assets, 'shared.css'), shared.replace('../public/honua/', './'));
  for (const file of ['theme.js', 'geist-latin.woff2', 'OFL.txt', 'honua-lockup.svg', 'honua-lockup-on-dark.svg']) {
    await cp(path.join(sample, 'public/honua', file), path.join(assets, file));
  }
}
