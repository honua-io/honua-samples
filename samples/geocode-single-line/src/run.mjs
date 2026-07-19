#!/usr/bin/env node
// geocode-single-line
//
// Plain REST call against Honua's Esri-compatible GeocodeServer
// (/rest/services/GeocodeServer/findAddressCandidates) -- no SDK, no
// import/publish bootstrap needed, just a single forward-geocode request
// asserted against a real, structured candidate.
//
// Unlike this repo's other new samples, there is nothing to import or
// publish here: geocoding is a server-wide capability, not something
// scoped to a layer/service the sample has to create first.
//
// Note on edition: the canonical capability key list marks
// `geocoding.forward` as a Pro-tier capability, and this sample's manifest
// honestly declares `"edition": "pro"` to match. In practice, the compose
// stack's Community-tier image answers `findAddressCandidates` anonymously
// via its built-in Nominatim-backed default geocoder with no license
// check enforced -- which is what lets this sample run and pass against
// the plain Community compose in CI today. See this repo's PR for
// honua-samples#4 for the full note; this isn't something to silently
// "fix" here, just something worth flagging upstream if unintentional.
//
// Zero npm dependencies: fetch is a Node >=18 built-in.

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const SINGLE_LINE_ADDRESS = process.env.HONUA_SAMPLE_ADDRESS ?? "380 New York St, Redlands, CA";

// Loose bounding box around Redlands, CA -- wide enough to tolerate
// reasonable geocoder variance, tight enough to catch a wrong-continent
// failure.
const EXPECTED_BBOX = { minLon: -117.5, maxLon: -116.9, minLat: 33.9, maxLat: 34.2 };

async function findAddressCandidates(singleLine) {
  const url = `${BASE_URL}/rest/services/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(singleLine)}&f=json`;
  const response = await fetch(url);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`findAddressCandidates: response was not JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`findAddressCandidates failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function isWithinBbox(x, y, bbox) {
  return x >= bbox.minLon && x <= bbox.maxLon && y >= bbox.minLat && y <= bbox.maxLat;
}

async function main() {
  const started = Date.now();
  console.log(`[geocode-single-line] target server: ${BASE_URL}`);

  console.log(`[geocode-single-line] 1/1 finding address candidates for "${SINGLE_LINE_ADDRESS}"...`);
  const result = await findAddressCandidates(SINGLE_LINE_ADDRESS);

  const candidates = result.candidates ?? [];
  const duration = Date.now() - started;

  if (candidates.length === 0) {
    console.error(`[geocode-single-line] FAIL in ${duration}ms: no candidates returned: ${JSON.stringify(result)}`);
    process.exit(1);
  }

  const top = candidates[0];
  const hasAddress = typeof top.address === "string" && top.address.length > 0;
  const location = top.location ?? {};
  const hasLocation = typeof location.x === "number" && typeof location.y === "number";
  const withinExpectedRegion = hasLocation && isWithinBbox(location.x, location.y, EXPECTED_BBOX);
  const hasScore = typeof top.score === "number";

  if (!hasAddress || !hasLocation || !withinExpectedRegion || !hasScore) {
    console.error(
      `[geocode-single-line] FAIL in ${duration}ms: top candidate missing expected shape: ${JSON.stringify(top)}`,
    );
    process.exit(1);
  }

  console.log(
    `[geocode-single-line] PASS in ${duration}ms: "${SINGLE_LINE_ADDRESS}" -> "${top.address}" at (${location.x}, ${location.y}), score ${top.score} (${candidates.length} candidate(s))`,
  );
}

main().catch((err) => {
  console.error(`[geocode-single-line] FAIL: ${err.message}`);
  process.exit(1);
});
