import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildStateLocalSite, validateStateLocalLinks } from '../state-local/build-site.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function admittedCard(id, commit) {
  return {
    id, sourceRepo: 'honua-samples', bundleRunnable: true, detailPath: `/${id}/`,
    ownApp: { dataMode: 'public-live', builtFrom: { commit } },
  };
}

function catalogFrom(html) {
  const samples = JSON.parse(html.match(/window\.HD=(.*?);<\/script>/s)[1])['13-sdk-samples'].samples;
  return Object.fromEntries(samples.map((sample) => [sample.id, sample]));
}
test('Explorer includes only admitted apps and preserves their build provenance', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-site-'));
  try {
    await buildStateLocalSite({ repoRoot, siteDir, cards: [
      { id: 'unverified', detailPath: '/sdk/unverified/', bundleSample: { dataMode: 'fixture' } },
      { id: 'verified', sourceRepo: 'honua-sdk-js', detailPath: '/sdk/verified/', bundleRunnable: true, bundleSample: { dataMode: 'fixture', builtFrom: { commit: 'sdk-revision' } } },
      { id: 'owned', sourceRepo: 'honua-samples', bundleRunnable: true, detailPath: '/owned/', ownApp: { entrypoint: 'demo.html', dataMode: 'live', builtFrom: { commit: 'sample-revision' } } },
    ] });
    const previews = JSON.parse(await readFile(path.join(siteDir, 'state-local/sdk-explorer/previews.json')));
    assert.deepEqual(previews, {
      'sdk-js:verified': { url: '/sdk/verified/app/', dataMode: 'fixture', dataModeLabel: 'fixture mode', commit: 'sdk-revision' },
      'samples:owned': { url: '/owned/app/demo.html', dataMode: 'live', dataModeLabel: 'live mode', commit: 'sample-revision' },
    });
    for (const route of ['property', '311', 'public-works']) {
      const directory = path.join(siteDir, 'state-local', route);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'index.html'), '<main>Published display demo</main>');
    }
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: \.\.\/county-parcel-viewer\//);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<img src="missing.png">');
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: missing.png/);
    await assert.rejects(buildStateLocalSite({ repoRoot, siteDir, cards: [{ id: 'unsafe', bundleRunnable: true, detailPath: '/unsafe/', ownApp: { entrypoint: '../outside.html' } }] }), /Unsafe sample entrypoint/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('approved display snapshots turn the two admitted Explorer previews into in-page sims', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-display-'));
  try {
    const display = path.join(siteDir, 'state-local/data/approved');
    await mkdir(display, { recursive: true });
    const collection = { type: 'FeatureCollection', features: [] };
    for (const name of ['land', 'roads', 'contours', 'streams', 'waterbodies', 'places', 'schools', 'shelters']) {
      await writeFile(path.join(display, `${name}.geojson`), JSON.stringify(collection));
    }
    const island = path.join(siteDir, 'state-local/data/island');
    await mkdir(island, { recursive: true });
    for (const name of ['places', 'schools']) await writeFile(path.join(island, `${name}.geojson`), JSON.stringify(collection));
    await writeFile(path.join(display, 'zoning.cjson'), '{}');
    await writeFile(path.join(display, 'parcels.cjson'), '{}');
    await writeFile(path.join(display, 'zone_names.json'), '{}');
    await buildStateLocalSite({ repoRoot, siteDir, cards: [
      admittedCard('county-parcel-viewer', 'parcel-revision'),
      admittedCard('maplibre-featureserver-layer', 'layer-revision'),
      admittedCard('maplibre-category-style-legend', 'category-revision'),
    ] });
    const html = await readFile(path.join(siteDir, 'state-local/sdk-explorer/index.html'), 'utf8');
    const shown = catalogFrom(html);
    assert.match(html, /SIMS\.fslayer/);
    assert.match(html, /Point radius/);
    assert.match(html, /Exercise anchors on real school locations/);
    assert.equal(parcelRecord(html).zoning, 'Residential district');
    assert.equal(shown['maplibre-featureserver-layer'].live, 'fslayer');
    assert.equal(shown['maplibre-featureserver-layer'].preview.commit, 'layer-revision');
    assert.equal(shown['maplibre-category-style-legend'].live, 'category');
    assert.equal(shown['maplibre-category-style-legend'].preview.commit, 'category-revision');
    assert.doesNotMatch(html, /Protomaps PMTiles from the same server/);
    assert.match(html, /Illustrative requests\. This preview did not call the server/);
    assert.match(html, /No server request was made/);
    assert.equal(shown['county-parcel-viewer'].live, 'verified');
    assert.equal(shown['county-parcel-viewer'].preview.commit, 'parcel-revision');
    assert.equal(shown['maplibre-quickstart'].live, null);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('display snapshots do not mark a sample live until its app is admitted', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-unadmitted-'));
  try {
    const display = path.join(siteDir, 'state-local/data/approved');
    await mkdir(display, { recursive: true });
    const collection = { type: 'FeatureCollection', features: [] };
    for (const name of ['land', 'roads', 'contours', 'streams', 'waterbodies', 'places', 'schools', 'shelters']) {
      await writeFile(path.join(display, `${name}.geojson`), JSON.stringify(collection));
    }
    const island = path.join(siteDir, 'state-local/data/island');
    await mkdir(island, { recursive: true });
    for (const name of ['places', 'schools']) await writeFile(path.join(island, `${name}.geojson`), JSON.stringify(collection));
    await writeFile(path.join(display, 'zoning.cjson'), '{}');
    await writeFile(path.join(display, 'parcels.cjson'), '{}');
    await writeFile(path.join(display, 'zone_names.json'), '{}');
    await buildStateLocalSite({ repoRoot, siteDir, cards: [] });
    const shown = catalogFrom(await readFile(path.join(siteDir, 'state-local/sdk-explorer/index.html'), 'utf8'));
    assert.equal(shown['maplibre-featureserver-layer'].live, null);
    assert.equal(shown['maplibre-featureserver-layer'].preview, null);
    assert.equal(shown['maplibre-category-style-legend'].live, null);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

function parcelRecord(html) {
  const start = html.indexOf('const D = HD["13-sdk-samples"]');
  const end = html.indexOf('function layerData');
  assert.ok(start > 0 && end > start);
  const context = {
    HD: { '13-sdk-samples': { samples: [], categories: [] }, zone_names: { R1: 'Residential district' } },
    HM: {
      get: () => ({ features: [{ type: 'Feature', properties: { id: 7, t9: '123', zone: 'R1', fld: 'X', lud: 'U', acres: 1, land: 2, bldg: 3 }, geometry: { type: 'Point', coordinates: [0, 0] } }] }),
      tmk: (value) => `TMK ${value}`,
      ZONE_GROUP: { R1: 'res' },
    },
    result: null,
  };
  runInNewContext(`${html.slice(start, end)}
    function layerData(key) { const L = LAYERS[key]; return { type: 'FeatureCollection', features: L.build() }; }
    result = layerData('parcels').features[0].properties;`, context);
  return context.result;
}

test('the approved overview links to the published SDK Explorer', async () => {
  const html = await readFile(path.join(repoRoot, 'scripts/state-local/approved/pages/01-overview.html'), 'utf8');
  assert.match(html, /href="\/state-local\/sdk-explorer\/"/);
  assert.doesNotMatch(html, /SDK explorer · Coming soon/);
});

test('source highlighting closes an HTML comment on the browser comment-end error', async () => {
  const html = await readFile(path.join(repoRoot, 'scripts/state-local/approved/13-sdk-explorer.html'), 'utf8');
  assert.ok(html.includes('<!--[\\s\\S]*?--!?>'));
  const comment = /<!--[\s\S]*?--!?>/;
  assert.equal('<!-- kept --!>'.match(comment)[0], '<!-- kept --!>');
  assert.equal('<!-- kept -->'.match(comment)[0], '<!-- kept -->');
});

test('an admitted catalog app stays verified when no display snapshot is loaded', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-verified-'));
  try {
    await buildStateLocalSite({ repoRoot, siteDir, cards: [
      admittedCard('county-parcel-viewer', 'parcel-revision'),
      admittedCard('maplibre-featureserver-layer', 'layer-revision'),
    ] });
    const shown = catalogFrom(await readFile(path.join(siteDir, 'state-local/sdk-explorer/index.html'), 'utf8'));
    assert.equal(shown['county-parcel-viewer'].live, 'verified');
    assert.equal(shown['county-parcel-viewer'].preview.commit, 'parcel-revision');
    assert.equal(shown['maplibre-featureserver-layer'].live, 'verified');
    assert.equal(shown['maplibre-featureserver-layer'].preview.dataMode, 'public-live');
    assert.equal(shown['maplibre-quickstart'].live, null);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('link validation ignores inline source examples while checking actual markup', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-links-'));
  try {
    for (const route of ['', 'switching/', 'sdk-explorer/']) {
      const dir = path.join(siteDir, 'state-local', route);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), '<script>const example = `<a href="missing-source.html">`;</script><a href="#main">Main</a>');
    }
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<script src="missing.js"></script>');
    await assert.rejects(validateStateLocalLinks(siteDir), /missing.js/);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<a href="missing-page.html">Missing</a>');
    await assert.rejects(validateStateLocalLinks(siteDir), /missing-page.html/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('gallery preserves the separately built landing and checks Switching links', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-site-'));
  try {
    await mkdir(path.join(siteDir, 'state-local'), { recursive: true });
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<main>Approved landing</main>');
    await buildStateLocalSite({ repoRoot, siteDir });
    assert.equal(await readFile(path.join(siteDir, 'state-local/index.html'), 'utf8'), '<main>Approved landing</main>');
    const switching = await readFile(path.join(siteDir, 'state-local/switching/index.html'), 'utf8');
    assert.match(switching, /including QField/);
    assert.match(switching, /Collect field app are in development/);
    await assert.rejects(validateStateLocalLinks(siteDir), /switching\/index.html:/);
    for (const route of ['property', '311', 'emergency', 'public-works']) {
      await mkdir(path.join(siteDir, 'state-local', route), { recursive: true });
      await writeFile(path.join(siteDir, 'state-local', route, 'index.html'), '<main>Published journey</main>');
    }
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script>const example = `<a href="source-only.html">`;</script><a href="#main">Main</a>');
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script>const example = `<a href="spaced-end.html">`;</script ><a href="#main">Main</a>');
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<SCRIPT>const example = `<a href="newline-end.html">`;</SCRIPT\n><a href="#main">Main</a>');
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script>const example = `<a href="attr-end.html">`;</script foo="bar"><a href="#main">Main</a>');
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script>const example = `<a href="tab-end.html">`;</script\t\n bar><a href="#main">Main</a>');
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script>const example = "https://example.invalid/unclosed";<a href="after-unclosed.html"></a>');
    await assert.rejects(validateStateLocalLinks(siteDir), /after-unclosed.html/);
    await writeFile(path.join(siteDir, 'state-local/switching/index.html'), '<script src="missing.js"></script>');
    await assert.rejects(validateStateLocalLinks(siteDir), /switching\/index.html: missing.js/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});
