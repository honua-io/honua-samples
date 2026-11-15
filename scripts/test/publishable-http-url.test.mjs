import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublishableHttpUrl } from "../lib/publishable-http-url.mjs";

test("public http(s) endpoints can be opened from the gallery", () => {
  assert.equal(isPublishableHttpUrl("https://demo.honua.io/ogc/features/collections"), true);
  assert.equal(isPublishableHttpUrl("http://example.com/query"), true);
});

test("loopback job fixtures are not gallery navigation", () => {
  assert.equal(isPublishableHttpUrl("http://127.0.0.1:8080/rest/services/admin_sample/FeatureServer/3000/query"), false);
  assert.equal(isPublishableHttpUrl("http://127.0.0.2/query"), false);
  assert.equal(isPublishableHttpUrl("http://localhost:8080/ogc/processes"), false);
  assert.equal(isPublishableHttpUrl("http://[::1]:8080/query"), false);
});

test("missing and non-http values are not opened", () => {
  assert.equal(isPublishableHttpUrl(""), false);
  assert.equal(isPublishableHttpUrl(null), false);
  assert.equal(isPublishableHttpUrl("javascript:alert(1)"), false);
  assert.equal(isPublishableHttpUrl("/relative"), false);
});
