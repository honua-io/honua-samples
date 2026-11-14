import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadJobPages } from "../validate-job-pages.mjs";
import { referenceRedirects, referenceDocumentUrl, writeReferenceRedirects } from "../lib/gallery-reference-redirects.mjs";

test("reference guidance leaves the gallery and its old URL redirects to the preserved document", async () => {
  const jobs = await loadJobPages();
  const siteDir = await mkdtemp(path.join(os.tmpdir(), "reference-redirect-"));
  const sourceCommit = "a".repeat(40);
  try {
    await writeReferenceRedirects({ siteDir, sourceCommit });
    for (const entry of referenceRedirects) {
      assert.ok(!jobs.some((job) => entry.route === `jobs/${job.id}`));
      const markdown = await readFile(new URL(`../../${entry.document}`, import.meta.url), "utf8");
      assert.ok(markdown.includes(entry.title));
      const html = await readFile(path.join(siteDir, entry.route, "index.html"), "utf8");
      const target = referenceDocumentUrl(entry, sourceCommit);
      assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${target}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${target}">`));
      assert.ok(html.includes(`<a href="${target}">`));
    }
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
});
