import path from 'node:path';

// Samples publish the exact admitted cards as JSON. Website cards and state/local
// navigation have no JSON inventory; follow their deployed links without a second URL list.
export async function discoverGallery(context, manifest, options = {}) {
  const entries = new Map();
  const failures = [];
  for (const source of manifest.sources) {
    await discoverSource(context, { source, entries, failures }, options);
  }
  if (!options.directory && failures.length) throw new Error(failures.map((failure) => failure.failure).join('; '));
  const found = [...entries.values()].sort((a, b) => a.url.localeCompare(b.url));
  return options.directory ? { entries: found, failures } : found;
}

async function discoverSource(context, { source, entries, failures }, options) {
  const pending = [source.url];
  const visited = new Set();
  while (pending.length) {
    const url = pending.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`Inventory ${url}: HTTP ${response?.status()}`);
      entries.set(url, { url, kind: source.kind });
      const links = await inventoryLinks(page, source, context.request);
      addLinks(links, { source, pending, entries });
    } catch (error) {
      const failure = { url, ok: false, failure: error.message };
      if (options.directory) {
        failure.screenshot = `${options.id}-inventory-${failures.length}.png`;
        await page.screenshot({ path: path.join(options.directory, failure.screenshot), fullPage: true })
          .catch((error) => { failure.screenshotError = error.message; });
      }
      failures.push(failure);
    } finally { await page.close(); }
  }
}

async function inventoryLinks(page, source, request) {
  if (source.inventory) {
    const response = await request.get(source.inventory);
    if (!response.ok()) throw new Error(`Inventory ${source.inventory}: HTTP ${response.status()}`);
    const inventory = await response.json();
    if (inventory.format !== 'honua.gallery-health-inventory.v1' || !inventory.entries?.length) throw new Error('Empty or invalid gallery card inventory');
    return inventory.entries.map((entry) => ({ ...entry, url: new URL(entry.url, source.url).href }));
  }
  const links = await page.locator(source.selector).evaluateAll((nodes) => nodes.map((node) => ({ url: node.href })).filter((entry) => entry.url));
  if (!links.length) throw new Error(`Inventory ${page.url()}: selector ${source.selector} found no links`);
  return links;
}

function addLinks(links, { source, pending, entries }) {
  for (const entry of links) {
    const target = new URL(entry.url);
    target.hash = '';
    if (!['http:', 'https:'].includes(target.protocol)) continue;
    if (source.kind === 'state-local' && (!target.href.startsWith(source.url) || !target.pathname.endsWith('/'))) continue;
    entries.set(target.href, { ...entry, url: target.href, kind: source.kind });
    if (source.recursive) pending.push(target.href);
  }
}
