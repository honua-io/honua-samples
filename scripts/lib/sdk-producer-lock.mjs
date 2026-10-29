import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const revision = "a9ed6e2d588f0412b09426620532228d2317b6e1";
const repository = "honua-io/honua-sdk-js";
const rawRoot = `https://raw.githubusercontent.com/${repository}/${revision}`;
const vendoredReleaseRoot = new URL(`../../vendor/sdk-producer/${revision}/`, import.meta.url);
const ARCHIVE_PART_NAME = /^sample-bundles\.tar\.gz\.part-\d{2}$/u;

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
      bytes: 67_292,
      sha256: "881f3cdce249ffe5d4ba95cec555c1026ad5ac785cc619f085c6894d6453cc74",
      provenance: "governed-local-build",
    }),
    // The packed archive is 137,740,064 bytes. GitHub rejects one blob over
    // 100 MiB, so the bytes are stored as ordered parts in the vendor directory
    // named by urls.bundleArchive. Readers concatenate those parts and then
    // check this digest. Parts stay under 50 MiB. This does not change the
    // producer archive or its evidence window.
    bundleArchive: Object.freeze({
      bytes: 137_740_064,
      sha256: "e751f61d15698921c376316cf76277b13f31ff9646967ff7825560366de1a0ce",
      provenance: "governed-local-build",
      parts: Object.freeze([
        Object.freeze({
          name: "sample-bundles.tar.gz.part-00",
          bytes: 47_185_920,
          sha256: "9a658bdc890149acc14a84baba1df4d321460fd2719ae48ba469ae07c30346c0",
        }),
        Object.freeze({
          name: "sample-bundles.tar.gz.part-01",
          bytes: 47_185_920,
          sha256: "ff835d2c9fb2ca54304773522651af766452f7ff6c0d0c76951a9ab0963f846b",
        }),
        Object.freeze({
          name: "sample-bundles.tar.gz.part-02",
          bytes: 43_368_224,
          sha256: "9886f0748b4386c1ab319a259604a981d11b66417993f6f58187cec2cfc000e8",
        }),
      ]),
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

/**
 * Reads one locked asset. A file URL whose declaration lists `parts` is the
 * concatenation of those sibling files, in order, not a single blob.
 */
export async function readDeclaredAssetBytes(kind, url, lock = SDK_PRODUCER_LOCK) {
  const declared = lock.assets?.[kind];
  const parts = declared?.parts;
  if (url.startsWith("file:") && Array.isArray(parts) && parts.length > 0) {
    const directory = path.dirname(fileURLToPath(url));
    const chunks = [];
    for (const part of parts) {
      if (!part || typeof part.name !== "string" || !ARCHIVE_PART_NAME.test(part.name)) {
        throw lockError(`${kind} part name ${JSON.stringify(part?.name)} is not an archive part`);
      }
      const partPath = path.join(directory, part.name);
      let bytes;
      try {
        bytes = await readFile(partPath);
      } catch (error) {
        const failure = new Error(
          `${kind} does not resolve: ${url} part ${part.name} is missing (${error.code ?? error.message}). ` +
            `The vendored producer revision ${lock.revision} is incomplete.`,
        );
        failure.code = "SDK_PRODUCER_ASSET_MISSING";
        throw failure;
      }
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== part.bytes || actualSha256 !== part.sha256) {
        throw lockError(
          `${kind} part ${part.name} content mismatch: expected ${part.bytes} bytes sha256 ${part.sha256}; ` +
            `received ${bytes.byteLength} bytes sha256 ${actualSha256}`,
        );
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  if (!url.startsWith("file:")) {
    throw lockError(`${kind} local reader cannot fetch ${JSON.stringify(url)}`);
  }
  try {
    return await readFile(fileURLToPath(url));
  } catch (error) {
    const failure = new Error(
      `${kind} does not resolve: ${url} is missing (${error.code ?? error.message}). ` +
        `The vendored producer revision ${lock.revision} is incomplete.`,
    );
    failure.code = "SDK_PRODUCER_ASSET_MISSING";
    throw failure;
  }
}

function lockError(message) {
  const error = new Error(`SDK producer lock mismatch: ${message}`);
  error.code = "SDK_PRODUCER_LOCK_MISMATCH";
  return error;
}
