import { createHash } from "node:crypto";

const revision = "d68f221a3ee49b86f06f0d587faf2c627263283d";
const repository = "honua-io/honua-sdk-js";
const rawRoot = `https://raw.githubusercontent.com/${repository}/${revision}`;
const vendoredReleaseRoot = new URL(`../../vendor/sdk-producer/${revision}/`, import.meta.url);

export const SDK_PRODUCER_LOCK = Object.freeze({
  format: "honua.samples.sdk-producer-lock.v1",
  repository,
  revision,
  urls: Object.freeze({
    handoffV2: `${rawRoot}/samples/dist/honua-site-consumer-handoff.v2.json`,
    fixtureV4: `${rawRoot}/samples/contract/v2/consumer-fixtures/honua-site-consumer.v4.json`,
    handoffV1: `${rawRoot}/samples/dist/honua-site-consumer-handoff.v1.json`,
    fixtureV3: `${rawRoot}/samples/contract/v2/consumer-fixtures/honua-site-consumer.v3.json`,
    catalog: `${rawRoot}/samples/catalog.v2.json`,
    crosswalk: `${rawRoot}/config/capability-crosswalk.v1.json`,
    bundleManifest: new URL("sample-bundles.v2.json", vendoredReleaseRoot).href,
    bundleArchive: new URL("sample-bundles.tar.gz", vendoredReleaseRoot).href,
  }),
  assets: Object.freeze({
    bundleManifest: Object.freeze({
      bytes: 85_856,
      sha256: "aa05bb75d112f3a079a06693ccae76e3b2b3c566e75e9d5b062adf06ff187198",
      provenance: "governed-local-build",
    }),
    bundleArchive: Object.freeze({
      bytes: 73_615_366,
      sha256: "f46278273e98d98599922a5db0d12c30128d737dfb7bbd2838bd5f21a0e9b1c6",
      provenance: "governed-local-build",
    }),
  }),
});

export function sdkProducerLockEnforced(env = process.env) {
  return env.SDK_PRODUCER_ENFORCE_LOCK === "1";
}

export function assertLockedProducerUrl(kind, value, { enforce = sdkProducerLockEnforced() } = {}) {
  const expected = SDK_PRODUCER_LOCK.urls[kind];
  if (!expected) throw lockError(`unknown SDK producer acquisition kind ${JSON.stringify(kind)}`);
  if (enforce && value !== expected) {
    throw lockError(`${kind} must use ${expected}; received ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertLockedProducerRevision(value, label = "SDK producer", { enforce = sdkProducerLockEnforced() } = {}) {
  if (enforce && value !== SDK_PRODUCER_LOCK.revision) {
    throw lockError(`${label} must equal ${SDK_PRODUCER_LOCK.revision}; received ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertLockedAssetDigest(kind, bytes, { enforce = sdkProducerLockEnforced() } = {}) {
  if (!enforce) return;
  const expected = SDK_PRODUCER_LOCK.assets[kind];
  if (!expected) throw lockError(`unknown SDK producer asset kind ${JSON.stringify(kind)}`);
  const buffer = Buffer.from(bytes);
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (buffer.byteLength !== expected.bytes || actualSha256 !== expected.sha256) {
    throw lockError(
      `${kind} content mismatch: expected ${expected.bytes} bytes sha256 ${expected.sha256}; ` +
        `received ${buffer.byteLength} bytes sha256 ${actualSha256}`,
    );
  }
}

export function lockedAssetRequestHeaders(url) {
  return url.startsWith("https://api.github.com/") ? { Accept: "application/octet-stream" } : undefined;
}

export function isSdkProducerLockError(error) {
  return error?.code === "SDK_PRODUCER_LOCK_MISMATCH";
}

function lockError(message) {
  const error = new Error(`SDK producer lock mismatch: ${message}`);
  error.code = "SDK_PRODUCER_LOCK_MISMATCH";
  return error;
}
