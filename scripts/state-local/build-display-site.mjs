import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/checksum.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const output = path.join(root, 'site/state-local');
const archiveDir = path.join(root, 'artifacts/display-download');
const lock = JSON.parse(await readFile(path.join(root, 'config/state-local-display.v1.json')));
const demos = [['maui-311', '311'], ['maui-public-works', 'public-works'], ['county-parcel-viewer', 'property']];

async function downloadSnapshots() {
  await mkdir(archiveDir, { recursive: true });
  const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Display snapshot HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (sha256(archive) !== lock.sha256) throw new Error('Display archive checksum mismatch');
  const filename = path.join(archiveDir, 'display.tar.gz');
  await writeFile(filename, archive);
  execFileSync('tar', ['-xzf', filename, '-C', archiveDir]);
  const manifest = JSON.parse(await readFile(path.join(archiveDir, 'manifest.json')));
  if (manifest.schemaVersion !== 1 || manifest.crs !== 'EPSG:4326') throw new Error('Unsupported display manifest');
  await mkdir(path.join(output, 'data'), { recursive: true });
  for (const [name, layer] of Object.entries(manifest.layers)) {
    if (!/^maui-[a-z-]+$/.test(name)) throw new Error('Invalid snapshot filename');
    const file = `${name}.geojson`;
    const data = await readFile(path.join(archiveDir, file));
    if (sha256(data) !== layer.sha256 || JSON.parse(data).features.length !== layer.count) throw new Error(`${name} snapshot integrity failed`);
    await writeFile(path.join(output, 'data', file), data);
  }
  for (const layer of Object.values(manifest.layers)) layer.source = layer.source?.replace('/blob/trunk/', `/blob/${lock.sourceRevision}/`) ?? null;
  await writeFile(path.join(output, 'data/manifest.json'), JSON.stringify(manifest, null, 2));
}

async function buildDemo([sample, route]) {
  const directory = path.join(root, 'samples', sample);
  execFileSync('npm', ['ci', '--silent'], { cwd: directory, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: directory, stdio: 'inherit', env: { ...process.env, VITE_STATE_LOCAL_SNAPSHOT: '1' } });
  const target = path.join(output, route);
  await cp(path.join(directory, 'dist'), target, { recursive: true });
  const index = path.join(target, 'index.html');
  let html = await readFile(index, 'utf8');
  const banner = `<p class="display-snapshot" style="margin:0;padding:10px 24px;background:var(--c-surface,#f5f5ef);color:var(--c-text,#18231c);font:14px/1.5 sans-serif">Real data: Hawaii Statewide GIS; demo records are labelled; snapshot ${lock.date}. <a href="../data/manifest.json">Sources, licences and per-layer dates</a>. Live data coming: API feeds, address search and field editing.</p>`;
  html = html.replace(/(<header\b[^>]*>)/, `${banner}$1`);
  html = html.replace('Parcel number (TMK) or street address', 'Parcel number (TMK)');
  html = html.replace("9-digit TMK, with or without dashes, or an address on Maui", "9-digit TMK, with or without dashes. Live address search coming.");
  html = html.replace("</head>", '<style>body.property-app{grid-template-rows:auto auto auto minmax(0,1fr) auto}</style></head>');
  html = html.replace('The OGC collection exposes all exercise requests and uses pagination.', 'Live data coming: OGC API Features and MCP queries. Downloads use the display snapshot.');
  html = html.replace('href="../">Run the published', `href="/${sample}/">Run the published`);
  await writeFile(index, html);
}

await downloadSnapshots();
for (const demo of demos) await buildDemo(demo);
