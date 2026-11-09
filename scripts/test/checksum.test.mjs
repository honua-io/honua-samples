import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../lib/checksum.mjs";
import { sha256 as appSha256 } from "../lib/own-sample-apps.mjs";
import { sha256 as producerSha256 } from "../validate-producer-lock-resolution.mjs";

test("SHA-256 accepts text and binary input with stable lowercase digests", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256(Buffer.from("abc")), sha256("abc"));
  assert.equal(sha256(new Uint8Array([97, 98, 99])), sha256("abc"));
});

test("existing public checksum exports use the shared implementation", () => {
  assert.equal(appSha256, sha256);
  assert.equal(producerSha256, sha256);
});
