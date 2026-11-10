// The standalone sample owns shared assets so clean sample exports remain buildable.
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function buildStateLocalSite({ repoRoot, siteDir, cards = [] }) {
  const source = path.join(repoRoot, 'scripts/state-local/site');
  const sample = path.join(repoRoot, 'samples/county-parcel-viewer');
  const output = path.join(siteDir, 'state-local');
  const assets = path.join(output, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(path.join(source, 'index.html'), path.join(output, 'index.html'));
  await cp(path.join(source, 'switching'), path.join(output, 'switching'), { recursive: true });
  await cp(path.join(source, 'sdk-explorer'), path.join(output, 'sdk-explorer'), { recursive: true });
  const previews = Object.fromEntries(cards.filter((card) => card.bundleRunnable || card.ownApp).map((card) => {
    const app = card.ownApp ?? card.bundleSample;
    const entry = app?.entrypoint ?? 'index.html';
    if (!/^[\w./-]+$/.test(entry) || entry.includes('..')) throw new Error(`Unsafe sample entrypoint: ${card.id}`);
    return [`${card.origin === 'sdk-js' || card.bundleSample ? 'sdk-js' : 'samples'}:${card.id}`, {
      url: `${card.detailPath}app/${entry === 'index.html' ? '' : entry}`,
      dataMode: app.dataMode, commit: app.builtFrom?.commit,
    }];
  }));
  await writeFile(path.join(output, 'sdk-explorer/previews.json'), JSON.stringify(previews));
  await cp(path.join(source, 'overview.css'), path.join(assets, 'overview.css'));
  await cp(path.join(sample, 'src/tokens.css'), path.join(assets, 'tokens.css'));
  const shared = await readFile(path.join(sample, 'src/shared.css'), 'utf8');
  await writeFile(path.join(assets, 'shared.css'), shared.replace('../public/honua/', './'));
  for (const file of ['theme.js', 'geist-latin.woff2', 'OFL.txt', 'honua-lockup.svg', 'honua-lockup-on-dark.svg']) {
    await cp(path.join(sample, 'public/honua', file), path.join(assets, file));
  }
}

// Validate after all gallery detail pages have been emitted.
export async function validateStateLocalLinks(siteDir) {
  for (const page of ['index.html', 'switching/index.html', 'sdk-explorer/index.html']) {
    const html = await readFile(path.join(siteDir, 'state-local', page), 'utf8');
    for (const [, href] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      const target = new URL(href, `https://gallery.invalid/state-local/${page}`);
      const relative = decodeURIComponent(target.pathname).replace(/^\//, '');
      const file = path.join(siteDir, relative, target.pathname.endsWith('/') ? 'index.html' : '');
      if (!(await stat(file).catch(() => null))?.isFile()) throw new Error(`State/local link does not resolve: ${page}: ${href}`);
    }
  }
}
