import assert from "node:assert/strict";
import test from "node:test";
import { computeOwnRunBadge, httpsUrlOrNull, runBadgeHtml } from "../lib/run-badge.mjs";

const active = { status: "active" };
const envelope = { generatedAt: "2026-11-14T12:30:00Z", runUrl: "https://github.com/honua-io/honua-samples/actions/runs/42" };

test("a sample without a recorded run gets no chip at all", () => {
  assert.equal(computeOwnRunBadge(active, undefined, envelope), null);
  assert.equal(runBadgeHtml(null), "");
});

test("a recorded run names its date and outcome and links to the CI run", () => {
  const badge = computeOwnRunBadge(active, { outcome: "pass", serverVersion: "2026.1.0" }, envelope);
  assert.deepEqual(badge, { state: "pass", label: "Server run passed 2026-11-14 against server 2026.1.0", url: envelope.runUrl });
  assert.equal(runBadgeHtml(badge),
    '<a class="badge pass" href="https://github.com/honua-io/honua-samples/actions/runs/42" target="_blank" rel="noopener noreferrer">Server run passed 2026-11-14 against server 2026.1.0 &nearr;</a>');
  const failed = computeOwnRunBadge(active, { outcome: "fail", serverVersion: "2026.1.0", error: "timeout <30s>" }, envelope);
  assert.equal(failed.state, "fail");
  assert.match(runBadgeHtml(failed), /Server run failed on 2026-11-14 \(server 2026\.1\.0\): timeout &lt;30s&gt;/);
});

test("only https run links are accepted from an envelope", () => {
  assert.equal(httpsUrlOrNull(envelope.runUrl), envelope.runUrl);
  for (const unsafe of ["javascript:alert(1)", "http://example.test/run", "", undefined, "not a url"]) {
    assert.equal(httpsUrlOrNull(unsafe), null);
  }
});

test("an envelope from a local run has no link, and drafts keep their own chip", () => {
  const local = computeOwnRunBadge(active, { outcome: "pass" }, { generatedAt: null, runUrl: null });
  assert.equal(runBadgeHtml(local), '<span class="badge pass">Server run passed an unknown date against server unknown</span>');
  assert.equal(computeOwnRunBadge({ status: "draft" }, undefined, envelope).state, "draft");
});
