#!/usr/bin/env node
// Fails loudly when a configured honua-sdk-js producer acquisition no longer
// resolves, or resolves to a format this consumer does not understand.
//
// honua-io/honua-samples#48: `scripts/lib/sample-bundles.mjs` consumed a
// rolling `sample-bundles-latest` release tag and a v1 manifest long after the
// producer retired both. Nothing failed. samples.honua.io simply rendered its
// "no runnable build published yet" panel -- the honest degradation, and
// exactly why the breakage stayed invisible for weeks. The pin has since moved
// to a per-commit revision and the v2 manifest; this check is what makes the
// *next* retirement a red CI step instead of a discovery.
//
// Two lanes, because the acquisitions are not all the same kind of thing:
//
//   local   any still-vendored bundle manifest/archive, checked offline.
//   remote  revision-pinned source projections and, when the lock adopts them,
//           exact content-addressed release assets. CI checks resolution,
//           declared bytes and SHA-256, and admitted manifest shape. The
//           gallery staging path independently verifies every archive member.
//
// Format expectations are not restated here. Each acquisition is handed to the
// same validator its consumer uses, so this check cannot drift away from what
// the gallery will actually accept at build time.

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { readDeclaredAssetBytes, SDK_PRODUCER_LOCK } from "./lib/sdk-producer-lock.mjs";
import { validateManifestShape } from "./lib/sample-bundles.mjs";
import { admitSdkJsHandoff } from "./lib/sdkjs-handoff.mjs";

const CATALOG_CONTRACT = Object.freeze({ format: "honua.sdk.sample-catalog.v2", schemaVersion: 2 });
const CROSSWALK_CONTRACT = Object.freeze({ format: "honua.sdk.capability-crosswalk.v1", schemaVersion: 1 });

/** Acquisitions that are fetched over the network, pinned to the locked revision. */
const REMOTE_KINDS = Object.freeze(["handoffV2", "fixtureV4", "handoffV1", "fixtureV3", "catalog", "crosswalk"]);

/** Bundle assets may be local or exact-source immutable release downloads. */
const ASSET_NAMES = Object.freeze({ bundleManifest: "sample-bundles.v2.json", bundleArchive: "sample-bundles.tar.gz" });
const ASSET_KINDS = Object.freeze(Object.keys(ASSET_NAMES));

export function partitionAcquisitions(lock = SDK_PRODUCER_LOCK) {
  const remote = [];
  const local = [];
  for (const [kind, url] of Object.entries(lock.urls)) {
    (url.startsWith("file:") ? local : remote).push({ kind, url });
  }
  return { remote, local };
}

/**
 * Every acquisition in the lock must be classified. An unclassified kind means
 * a new producer input was added without teaching this check how to prove it
 * resolves, which is the same silence #48 was about.
 */
export function unclassifiedKinds(lock = SDK_PRODUCER_LOCK) {
  const known = new Set([...REMOTE_KINDS, ...ASSET_KINDS]);
  return Object.keys(lock.urls).filter((kind) => !known.has(kind));
}

/**
 * The clock to admit a handoff against when the question is "does this still
 * resolve", not "is this still fresh".
 *
 * `admitSdkJsHandoff` folds two independent judgements together: whether the
 * pair speaks a contract this consumer reads, and whether its visual evidence
 * has expired against the wall clock. Only the first belongs here. Freshness is
 * a real gate, but it is the staging lane's -- `ensureSampleBundlesStaged` and
 * the gallery build already admit against `new Date()` and fail the deploy on a
 * lapsed window. Repeating it here would leave this check permanently red for a
 * reason that has nothing to do with resolution, and a permanently red check
 * gets ignored -- which is the disease #48 describes, not the cure.
 *
 * So admit against the producer's own publication instant: the latest evidence
 * observation in the payload. A self-consistent handoff always satisfies
 * `observedAt <= now < expiresAt` there, leaving the schema, route, sample, and
 * qualification assertions as the only things that can fail.
 */
export function producerClock(handoff) {
  const observations = (Array.isArray(handoff?.qualifiedJourneys) ? handoff.qualifiedJourneys : [])
    .map((journey) => Date.parse(journey?.visualEvidence?.observedAt ?? ""))
    .filter((value) => Number.isFinite(value));
  return observations.length > 0 ? new Date(Math.max(...observations)) : new Date();
}

export function assertContract(kind, payload, contract) {
  if (payload?.format !== contract.format || payload?.schemaVersion !== contract.schemaVersion) {
    throw new Error(
      `${kind} resolved to format ${JSON.stringify(payload?.format)} schemaVersion ` +
        `${JSON.stringify(payload?.schemaVersion)}; this consumer reads "${contract.format}" ` +
        `schemaVersion ${contract.schemaVersion}. The producer moved -- re-pin the lock and migrate the reader.`,
    );
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Verify one vendored asset against the digest the lock declares for it. */
export async function checkLocalAsset(kind, url, lock = SDK_PRODUCER_LOCK) {
  const declared = lock.assets[kind];
  if (!declared) {
    throw new Error(`${kind} is vendored but the producer lock declares no digest for it`);
  }
  const bytes = await readDeclaredAssetBytes(kind, url, lock);
  if (bytes.byteLength !== declared.bytes) {
    throw new Error(`${kind} is ${bytes.byteLength} bytes; the lock declares ${declared.bytes}`);
  }
  const digest = sha256(bytes);
  if (digest !== declared.sha256) {
    throw new Error(`${kind} digest is ${digest}; the lock declares ${declared.sha256}`);
  }
  if (kind === "bundleManifest") {
    validateManifestShape(JSON.parse(bytes.toString("utf8")), { expectedRevision: lock.revision });
  }
  return `${declared.bytes} bytes, sha256 ${digest.slice(0, 12)}…`;
}

/** Verify an exact-source release asset without admitting a rolling tag or unbounded response. */
export async function checkRemoteAsset(kind, url, lock = SDK_PRODUCER_LOCK, { fetchImpl = fetch } = {}) {
  const name = ASSET_NAMES[kind];
  const declared = lock.assets[kind];
  if (!name || !declared) throw new Error(`${kind} has no declared release asset digest`);
  const expectedUrl = `https://github.com/${lock.repository}/releases/download/sample-bundles-${lock.revision}/${name}`;
  if (url !== expectedUrl) throw new Error(`${kind} must resolve from exact immutable release ${expectedUrl}`);
  if (!Number.isSafeInteger(declared.bytes) || declared.bytes < 1 || declared.bytes > 512 * 1024 * 1024 ||
      !/^[0-9a-f]{64}$/u.test(declared.sha256)) throw new Error(`${kind} has invalid bounded digest metadata`);

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const failure = new Error(`${kind} could not be fetched: ${error.message}`);
    failure.networkFailure = true;
    throw failure;
  }
  if (!response.ok) throw new Error(`${kind} does not resolve: HTTP ${response.status}`);
  if (!response.body) throw new Error(`${kind} has no response body`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > declared.bytes) throw new Error(`${kind} exceeds the lock's ${declared.bytes}-byte bound`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, length);
  if (length !== declared.bytes || sha256(bytes) !== declared.sha256) {
    throw new Error(`${kind} bytes or SHA-256 differ from the producer lock`);
  }
  if (kind === "bundleManifest") {
    validateManifestShape(JSON.parse(bytes.toString("utf8")), { expectedRevision: lock.revision });
  }
  return `${length} bytes, sha256 ${declared.sha256.slice(0, 12)}…`;
}

async function fetchJson(kind, url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    const failure = new Error(`${kind} could not be fetched from ${url}: ${error.message}`);
    failure.networkFailure = true;
    throw failure;
  }
  if (!response.ok) {
    throw new Error(
      `${kind} does not resolve: ${url} returned HTTP ${response.status}. ` +
        `The pinned producer revision or path no longer exists -- this is the honua-samples#48 failure mode.`,
    );
  }
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch (error) {
    throw new Error(`${kind} resolved but is not valid JSON: ${error.message}`);
  }
}

/** Verify every remote acquisition resolves and still speaks a readable contract. */
export async function checkRemote(lock = SDK_PRODUCER_LOCK, { fetchImpl } = {}) {
  const load = fetchImpl ? (kind, url) => fetchImpl(kind, url) : fetchJson;
  const payloads = new Map();
  const notes = [];
  for (const kind of REMOTE_KINDS) {
    const url = lock.urls[kind];
    if (!url) throw new Error(`producer lock is missing the ${kind} URL`);
    payloads.set(kind, await load(kind, url));
    notes.push([kind, `HTTP 200 (${payloads.get(kind).text.length} bytes)`]);
  }

  // Handoff and fixture are one contract, not two files: hand the pair to the
  // gallery's own admission gate rather than re-deriving what it accepts.
  for (const [handoffKind, fixtureKind] of [
    ["handoffV2", "fixtureV4"],
    ["handoffV1", "fixtureV3"],
  ]) {
    const handoffText = payloads.get(handoffKind).text;
    const decision = admitSdkJsHandoff({
      handoffText,
      fixtureText: payloads.get(fixtureKind).text,
      now: producerClock(payloads.get(handoffKind).json),
    });
    if (!decision.ok) {
      throw new Error(
        `${handoffKind}/${fixtureKind} resolved but this consumer cannot admit them:\n` +
          decision.errors.map((line) => `      ${line}`).join("\n"),
      );
    }
  }

  assertContract("catalog", payloads.get("catalog").json, CATALOG_CONTRACT);
  assertContract("crosswalk", payloads.get("crosswalk").json, CROSSWALK_CONTRACT);
  return notes;
}

export async function main(argv = process.argv.slice(2)) {
  const offline = argv.includes("--offline");
  const lock = SDK_PRODUCER_LOCK;
  const failures = [];
  const report = [];

  const stray = unclassifiedKinds(lock);
  if (stray.length > 0) {
    failures.push(
      `producer lock declares acquisition(s) this check does not classify: ${stray.join(", ")}. ` +
        `Classify them as remote source projections or bundle assets so a retirement cannot pass unnoticed.`,
    );
  }

  for (const { kind, url } of partitionAcquisitions(lock).local) {
    try {
      report.push(["local", kind, await checkLocalAsset(kind, url, lock)]);
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (offline) {
    report.push(["remote", "(all)", "skipped (--offline)"]);
  } else {
    try {
      for (const { kind, url } of partitionAcquisitions(lock).remote.filter(({ kind }) => ASSET_KINDS.includes(kind))) {
        report.push(["remote", kind, await checkRemoteAsset(kind, url, lock)]);
      }
      for (const [kind, note] of await checkRemote(lock)) report.push(["remote", kind, note]);
    } catch (error) {
      if (error.networkFailure) {
        failures.push(
          `${error.message}\n      If this host has no network, run with --offline; CI must not skip the remote lane.`,
        );
      } else {
        failures.push(error.message);
      }
    }
  }

  console.log(`producer lock ${lock.repository}@${lock.revision}`);
  for (const [lane, kind, note] of report) console.log(`  ${lane.padEnd(6)} ${kind.padEnd(14)} ${note}`);

  if (failures.length === 0) {
    console.log(`\nAll ${Object.keys(lock.urls).length} producer acquisitions resolve.`);
    return 0;
  }
  console.error(`\n${failures.length} producer acquisition(s) no longer resolve:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nRe-pin scripts/lib/sdk-producer-lock.mjs to a producer revision that still publishes\n" +
      "these inputs, re-vendor the bundle assets, and migrate any reader whose contract moved.\n" +
      "Do not relax a format assertion to make this pass.",
  );
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
