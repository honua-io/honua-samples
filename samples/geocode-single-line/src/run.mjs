#!/usr/bin/env node

const BASE_URL = process.env.HONUA_BASE_URL ?? "https://demo.honua.io";
const ADDRESS = process.env.HONUA_SAMPLE_ADDRESS ?? "380 New York St, Redlands, CA";

async function main() {
  const query = new URLSearchParams({ SingleLine: ADDRESS, f: "json" });
  const response = await fetch(
    `${BASE_URL}/rest/services/GeocodeServer/findAddressCandidates?${query}`,
  );
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(JSON.stringify(result.error ?? result));
  }

  const candidate = result.candidates?.[0];
  if (!candidate?.address || typeof candidate.location?.x !== "number") {
    throw new Error("No candidate with an address and location was returned");
  }

  console.log(
    `PASS: "${ADDRESS}" -> "${candidate.address}" (${candidate.location.x}, ${candidate.location.y}), score ${candidate.score}`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
