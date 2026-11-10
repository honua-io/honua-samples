import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sample = path.join(root, 'samples/county-parcel-viewer');

test('approved shared tokens declare light and dark semantic colors with source provenance', async () => {
  const tokens = await readFile(path.join(sample, 'src/tokens.css'), 'utf8');
  assert.match(tokens, /Source: design-system\/tokens\.css @ [a-f0-9]{40}/);
  assert.match(tokens, /:root\[data-theme="dark"\]/);
  for (const name of ['c-bg', 'c-text', 'c-accent', 'map-land', 'map-water', 'map-select', 'hz-flood']) {
    assert.ok([...tokens.matchAll(new RegExp(`--${name}:`, 'g'))].length >= 2, `${name} must cover both themes`);
  }
});

test('demo component styles use tokens rather than literal colors', async () => {
  for (const file of ['samples/county-parcel-viewer/src/styles.css', 'samples/county-parcel-viewer/src/shared.css', 'scripts/state-local/site/overview.css']) {
    const css = (await readFile(path.join(root, file), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[a-f0-9]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i, file);
  }
});
