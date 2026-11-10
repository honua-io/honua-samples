// The standalone sample owns shared assets so clean sample exports remain buildable.
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { approvedPage } from '../../shared/state-local/approved-page.mjs';
import { DATA_MODE_LABELS } from '../lib/data-mode-labels.mjs';
import { sampleAppPath } from '../lib/sample-app-url.mjs';

export async function buildStateLocalSite({ repoRoot, siteDir, cards = [] }) {
  const source = path.join(repoRoot, 'scripts/state-local/site');
  const sample = path.join(repoRoot, 'samples/county-parcel-viewer');
  const output = path.join(siteDir, 'state-local');
  const assets = path.join(output, 'assets');
  await mkdir(assets, { recursive: true });
  await cp(path.join(source, 'index.html'), path.join(output, 'index.html'));
  await mkdir(path.join(output, 'switching'), { recursive: true });
  await writeFile(path.join(output, 'switching/index.html'), await approvedPage({
    template: path.join(repoRoot, 'scripts/state-local/approved/09-switching.html'),
    assets: path.join(repoRoot, 'samples/maui-emergency/approved/src'), data: {},
  }));
  await mkdir(path.join(output, 'sdk-explorer'), { recursive: true });
  const previews = Object.fromEntries(cards.filter((card) => card.bundleRunnable).map((card) => {
    const app = card.ownApp ?? card.bundleSample;
    return [`${card.sourceRepo === 'honua-sdk-js' ? 'sdk-js' : 'samples'}:${card.id}`, {
      url: `${card.detailPath}${sampleAppPath(app)}`,
      dataMode: app.dataMode, dataModeLabel: DATA_MODE_LABELS[app.dataMode] ?? app.dataMode, commit: app.builtFrom?.commit,
    }];
  }));
  await writeFile(path.join(output, 'sdk-explorer/previews.json'), JSON.stringify(previews));
  const catalog = JSON.parse(await readFile(path.join(source, 'sdk-explorer/catalog.json'), 'utf8'));
  catalog.server = 'https://demo.honua.io';
  for (const sample of catalog.samples) {
    sample.preview = previews[`${sample.repo}:${sample.id}`] ?? null;
    sample.live = sample.preview ? 'verified' : null;
  }
  await writeFile(path.join(output, 'sdk-explorer/index.html'), await approvedPage({
    template: path.join(repoRoot, 'scripts/state-local/approved/13-sdk-explorer.html'),
    assets: path.join(repoRoot, 'samples/maui-emergency/approved/src'), data: { '13-sdk-samples': catalog },
  }));
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
