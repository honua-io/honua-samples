import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderMarkdown } from '../lib/markdown-lite.mjs';

const revision = 'a'.repeat(40);
const sourceUrl = `https://github.com/honua-io/honua-samples/blob/${revision}/samples/county-parcel-viewer/README.md`;

test('published README documentation links keep their source revision', async () => {
  const readme = await readFile(new URL('../../samples/county-parcel-viewer/README.md', import.meta.url), 'utf8');
  const html = renderMarkdown(readme, sourceUrl);
  for (const document of ['native-applications.md', 'state-local-mcp.md', 'browser-verification/README.md']) {
    assert.ok(html.includes(`href="https://github.com/honua-io/honua-samples/blob/${revision}/docs/${document}"`));
    await readFile(new URL(`../../docs/${document}`, import.meta.url));
  }
  assert.ok(!html.includes('href="../../docs/'));
});

test('source links resolve across markdown blocks while anchors and external URLs stay intact', () => {
  const markdown = '# [Guide](../../docs/native-applications.md)\n\n- [File](./sample.json)\n\n| Local | External |\n| --- | --- |\n| [Section](#example) | [Site](https://honua.io/) |\n\n```html\n<a href="../../docs/example.md">example</a>\n```';
  const html = renderMarkdown(markdown, sourceUrl);
  assert.ok(html.includes(`href="https://github.com/honua-io/honua-samples/blob/${revision}/samples/county-parcel-viewer/sample.json"`));
  assert.ok(html.includes('href="#example"'));
  assert.ok(html.includes('href="https://honua.io/"'));
  assert.ok(html.includes('&lt;a href="../../docs/example.md"&gt;'));
  assert.ok(renderMarkdown('[File](./sample.json)').includes('href="./sample.json"'));
});
