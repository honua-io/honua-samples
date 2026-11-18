import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const pages = [
  'scripts/state-local/site/index.html',
  'scripts/state-local/approved/pages/01-overview.html',
  'scripts/state-local/approved/pages/02-property.html',
  'scripts/state-local/approved/pages/03-311.html',
  'scripts/state-local/approved/pages/05-public-works.html',
  'scripts/state-local/approved/pages/07-catalog.html',
  'scripts/state-local/approved/pages/10-property-mobile.html',
  'scripts/state-local/approved/pages/12-workbench.html',
  'scripts/state-local/approved/09-switching.html',
  'scripts/state-local/approved/13-sdk-explorer.html',
  'samples/maui-emergency/index.html',
  'samples/maui-emergency/approved/pages/04-emergency.html',
  'samples/maui-emergency/approved/pages/11-emergency-mobile.html',
];

function skipTarget(html, file) {
  const link = html.match(/<a class="skip(?:-link)?" href="#([^"]+)">/);
  assert.ok(link, `${file} has a skip link`);
  const id = link[1];
  const tag = html.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  assert.ok(tag, `${file} has #${id}`);
  assert.match(tag[0], /tabindex="-1"/, `${file} #${id} is focusable for the skip link`);
  assert.doesNotMatch(html, /tabindex="[1-9]/, `${file} has no positive tabindex`);
}

test('state-local skip targets are programmatically focusable', async () => {
  for (const file of pages) {
    skipTarget(await readFile(path.join(root, file), 'utf8'), file);
  }
});
