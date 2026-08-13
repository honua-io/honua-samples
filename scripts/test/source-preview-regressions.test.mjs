import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { bindSdkSourceToBundle } from "../lib/sdk-source-binding.mjs";
import { SDK_PRODUCER_LOCK } from "../lib/sdk-producer-lock.mjs";

test("rejects a quote-bearing docs path before HTML rendering", () => {
  assert.throws(() => bindSdkSourceToBundle({ repository: SDK_PRODUCER_LOCK.repository, sourcePath: "examples/safe", docsPath: 'examples/safe/README.md" onclick="alert(1)', bundleSample: { id: "safe", builtFrom: { commit: SDK_PRODUCER_LOCK.revision } } }), /unsafe|path/i);
});

test("source fetch failure never falls back to trunk", async () => {
  const source = await readFile(new URL("../gallery-assets/source-preview.js", import.meta.url), "utf8");
  const requests = [];
  const context = { document: { addEventListener() {} }, fetch: async (url) => { requests.push(String(url)); return { ok: false }; }, console };
  vm.runInNewContext(source, context);
  const fields = { name: { textContent: "" }, code: { textContent: "" }, note: { textContent: "" } };
  const root = `https://raw.githubusercontent.com/${SDK_PRODUCER_LOCK.repository}/${SDK_PRODUCER_LOCK.revision}/examples/safe`;
  const panel = {
    getAttribute(name) { return { "data-source-root": root, "data-source-path": "examples/safe", "data-source-revision": SDK_PRODUCER_LOCK.revision }[name] ?? null; },
    querySelector(selector) { return selector.includes("name") ? fields.name : selector.includes("code") ? fields.code : fields.note; },
  };
  await context.__HONUA_SOURCE_PREVIEW_LOAD__(panel);
  assert.ok(requests.length > 0);
  assert.ok(requests.every((url) => url.includes(SDK_PRODUCER_LOCK.revision)));
  assert.ok(requests.every((url) => !url.includes("trunk")));
  assert.match(fields.note.textContent, /no mutable branch fallback/i);
});
