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
  const landing = path.join(output, 'index.html');
  if (!(await stat(landing).catch(() => null))?.isFile()) {
    await cp(path.join(source, 'index.html'), landing);
  }
  await mkdir(path.join(output, 'switching'), { recursive: true });
  await writeFile(path.join(output, 'switching/index.html'), await approvedPage({
    template: path.join(repoRoot, 'scripts/state-local/approved/09-switching.html'),
    assets: path.join(repoRoot, 'samples/maui-emergency/approved/src'), data: {},
  }));
  await buildSdkExplorer({ repoRoot, siteDir, cards, source });
  await cp(path.join(source, 'overview.css'), path.join(assets, 'overview.css'));
  await cp(path.join(sample, 'src/tokens.css'), path.join(assets, 'tokens.css'));
  const shared = await readFile(path.join(sample, 'src/shared.css'), 'utf8');
  await writeFile(path.join(assets, 'shared.css'), shared.replace('../public/honua/', './'));
  for (const file of ['theme.js', 'geist-latin.woff2', 'OFL.txt', 'honua-lockup.svg', 'honua-lockup-on-dark.svg']) {
    await cp(path.join(sample, 'public/honua', file), path.join(assets, file));
  }
}

const PAGE_SIMS = {
  'samples:maplibre-featureserver-layer': 'fslayer',
  'samples:maplibre-category-style-legend': 'category',
};

async function buildSdkExplorer({ repoRoot, siteDir, cards, source }) {
  const output = path.join(siteDir, 'state-local', 'sdk-explorer');
  await mkdir(output, { recursive: true });
  const previews = Object.fromEntries(cards.filter((card) => card.bundleRunnable).map((card) => {
    const app = card.ownApp ?? card.bundleSample;
    return [`${card.sourceRepo === 'honua-sdk-js' ? 'sdk-js' : 'samples'}:${card.id}`, {
      url: `${card.detailPath}${sampleAppPath(app)}`,
      dataMode: app.dataMode, dataModeLabel: DATA_MODE_LABELS[app.dataMode] ?? app.dataMode, commit: app.builtFrom?.commit,
    }];
  }));
  await writeFile(path.join(output, 'previews.json'), JSON.stringify(previews));
  const catalog = JSON.parse(await readFile(path.join(source, 'sdk-explorer/catalog.json'), 'utf8'));
  catalog.server = 'https://demo.honua.io';
  const display = await loadApprovedDisplay(siteDir);
  catalog.display = Boolean(display);
  for (const entry of catalog.samples) {
    entry.preview = previews[`${entry.repo}:${entry.id}`] ?? null;
    const simulation = PAGE_SIMS[`${entry.repo}:${entry.id}`];
    entry.live = entry.preview ? ((display && simulation) || 'verified') : null;
  }
  await writeFile(path.join(output, 'index.html'), await approvedPage({
    template: path.join(repoRoot, 'scripts/state-local/approved/13-sdk-explorer.html'),
    assets: path.join(repoRoot, 'samples/maui-emergency/approved/src'),
    data: { '13-sdk-samples': catalog, ...(display ?? {}) },
  }));
}

const DISPLAY_LAYERS = ['land', 'roads', 'contours', 'streams', 'waterbodies', 'zoning', 'parcels', 'places', 'schools', 'shelters', 'zone_names'];

async function loadApprovedDisplay(siteDir) {
  const directory = path.join(siteDir, 'state-local/data/approved');
  const data = {};
  for (const name of DISPLAY_LAYERS) {
    let raw = null;
    for (const extension of ['.cjson', '.geojson', '.json']) {
      raw = await readFile(path.join(directory, `${name}${extension}`), 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (raw != null) break;
    }
    if (raw == null) return null;
    data[name] = JSON.parse(raw);
  }
  return data;
}

// Validate after all gallery detail pages have been emitted.
export async function validateStateLocalLinks(siteDir) {
  for (const page of ['index.html', 'switching/index.html', 'sdk-explorer/index.html']) {
    const html = (await readFile(path.join(siteDir, 'state-local', page), 'utf8')).replace(/(<script\b[^>]*>)[\s\S]*?<\/script[^>]*>/gi, '$1</script>');
    for (const [, href] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      const target = new URL(href, `https://gallery.invalid/state-local/${page}`);
      const relative = decodeURIComponent(target.pathname).replace(/^\//, '');
      const file = path.join(siteDir, relative, target.pathname.endsWith('/') ? 'index.html' : '');
      if (!(await stat(file).catch(() => null))?.isFile()) throw new Error(`State/local link does not resolve: ${page}: ${href}`);
    }
  }
}
