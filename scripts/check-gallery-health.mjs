import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { discoverGallery } from './lib/gallery-health-discovery.mjs';
import { captureMaps } from './lib/gallery-health-map.mjs';
import { checkGalleryPage } from './lib/gallery-health-check.mjs';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from './lib/gallery-visual-contract.mjs';

const manifest = JSON.parse(await readFile(process.env.GALLERY_HEALTH_MANIFEST ?? 'config/gallery-health.v1.json', 'utf8'));
if (manifest.format !== 'honua.gallery-health.v1' || !manifest.sources?.length) throw new Error('Invalid gallery health manifest');
const directory = path.resolve(process.env.GALLERY_HEALTH_OUTPUT ?? '.artifacts/gallery-health');
await mkdir(directory, { recursive: true });
const report = { format: 'honua.gallery-health-result.v1', checkedAt: new Date().toISOString(), signedOut: true, results: [] };
const profiles = { desktop: DESKTOP_VIEWPORT, mobile: MOBILE_VIEWPORT };

async function checkEntry(browser, entry, options) {
  // Each demo starts with new anonymous storage and cookies, including embedded frames.
  const context = await browser.newContext({ viewport: options.viewport, serviceWorkers: 'block' });
  try {
    await context.addInitScript(captureMaps);
    return await checkGalleryPage(context, entry, { directory, id: options.id, linkCache: options.linkCache });
  } finally { await context.close(); }
}

async function checkProfile(browser, engine, profile) {
  const viewport = profiles[profile];
  const discovery = await browser.newContext({ viewport });
  let inventory;
  try { inventory = await discoverGallery(discovery, manifest, { directory, id: `${engine}-${profile}` }); }
  finally { await discovery.close(); }
  const identity = { engine, version: browser.version(), profile };
  report.results.push(...inventory.failures.map((failure) => ({ ...identity, ...failure })));
  const linkCache = new Map();
  const pending = [...inventory.entries.entries()];
  const worker = async () => {
    while (pending.length) {
      const [index, entry] = pending.shift();
      const result = await checkEntry(browser, entry, { viewport, id: `${engine}-${profile}-${index}`, linkCache });
      report.results.push({ ...identity, ...result });
      console.log(`${engine}/${profile} ${result.ok ? 'PASS' : 'FAIL'} ${entry.url} ${result.failure ?? `${result.firstPaintMs}ms`}`);
    }
  };
  // Headed Firefox suspends paint timing for background tabs: keep one demo active.
  const concurrency = engine === 'firefox' ? 1 : 4;
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
}

async function checkEngine(engine, launcher) {
  const browser = await launcher.launch(engine === 'firefox'
    ? { headless: !process.env.DISPLAY, firefoxUserPrefs: { 'webgl.force-enabled': true } } : {});
  try {
    for (const profile of Object.keys(profiles)) await checkProfile(browser, engine, profile);
  } finally { await browser.close(); }
}

async function writeReport() {
  report.ok = report.results.length > 0 && report.results.every((result) => result.ok);
  await writeFile(path.join(directory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.results.map((result) => `| ${result.engine}/${result.profile ?? 'startup'} | ${result.url ?? 'Runner'} | ${result.ok ? 'PASS' : 'FAIL'} | ${result.firstPaintMs ?? '—'} | ${String(result.failure ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')} |`);
  await writeFile(path.join(directory, 'latest.md'), `Gallery health: **${report.ok ? 'PASS' : 'FAIL'}** — ${report.checkedAt}\n\nFresh signed-out contexts; Chromium and Firefox; desktop and mobile.\n\n| Browser/viewport | Page | Result | First paint (ms) | Failure |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  if (!report.ok) process.exitCode = 1;
}

try {
  for (const [engine, launcher] of Object.entries({ chromium, firefox })) {
    await checkEngine(engine, launcher).catch((error) => report.results.push({ engine, ok: false, failure: error.message }));
  }
} finally { await writeReport(); }
