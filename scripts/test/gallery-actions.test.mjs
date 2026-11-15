import assert from "node:assert/strict";
import test from "node:test";
import { galleryActions, renderGalleryActions } from "../lib/gallery-actions.mjs";

test("runnable cards expose open, build and pinned source in the same order", () => {
  const actions = galleryActions({ openUrl: "./demo/", sourceUrl: "https://github.com/honua-io/honua-samples/tree/" + "a".repeat(40) + "/samples/demo" });
  assert.deepEqual(actions.map((action) => action.kind), ["open", "build", "source"]);
  assert.equal(actions[0].href, "./demo/");
  assert.match(actions[2].href, /\/a{40}\/samples\/demo$/u);
  assert.equal(actions[1].href, undefined);
  assert.match(actions[1].reason, /App builder import is not available/u);
});

test("unavailable actions carry visible accessible explanations and no fake links", () => {
  const html = renderGalleryActions({ unavailableReason: "No browser build <yet>." });
  assert.equal((html.match(/aria-disabled="true"/gu) ?? []).length, 3);
  assert.doesNotMatch(html, /href=/u);
  assert.match(html, /No browser build &lt;yet&gt;\./u);
  assert.match(html, /Source for this published build is not available/u);
});

test("destinations are escaped without changing labels", () => {
  const html = renderGalleryActions({ openUrl: './demo/?a="&b=<', sourceUrl: 'https://example.test/"' });
  assert.match(html, /href="\.\/demo\/\?a=&quot;&amp;b=&lt;"/u);
  assert.match(html, />Open it &rarr;/u);
  assert.match(html, />View code &rarr;/u);
});
