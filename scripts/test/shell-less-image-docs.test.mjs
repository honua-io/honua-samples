import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const island = await readFile(new URL('../state-local/approved/ISLAND.md', import.meta.url), 'utf8');
const wms = await readFile(new URL('../../samples/wms-getmap-check/README.md', import.meta.url), 'utf8');
const composeBlocks = [...island.matchAll(/```sh\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .filter((block) => block.includes('docker compose'));

test('island commands do not enter the shell-less server image', () => {
  assert.ok(composeBlocks.length >= 2);
  for (const block of composeBlocks) {
    assert.doesNotMatch(block, /entrypoint \S+ honua\b/);
    assert.doesNotMatch(block, /\brun\b[\s\S]*\bhonua\b/);
  }
  const prepare = composeBlocks.find((block) => block.includes('chgrp'));
  const cleanup = composeBlocks.find((block) => block.includes('-delete'));
  assert.match(prepare, /--entrypoint sh postgres/);
  assert.match(prepare, /-v "\$HONUA_TILE_STORAGE_ROOT:\$HONUA_TILE_STORAGE_ROOT"/);
  assert.match(prepare, /chgrp 1001 "\$1" && chmod 2770 "\$1"/);
  assert.match(cleanup, /--entrypoint find postgres/);
  assert.match(cleanup, /-v "\$HONUA_TILE_STORAGE_ROOT:\$HONUA_TILE_STORAGE_ROOT"/);
});

test('wms readme names the compiled readiness probe', () => {
  assert.match(wms, /\/app\/honua-healthcheck --ready/);
  assert.doesNotMatch(wms, /healthcheck uses the image's `bash`/);
});
