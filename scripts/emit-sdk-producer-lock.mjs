#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { SDK_PRODUCER_LOCK } from "./lib/sdk-producer-lock.mjs";

const lines = [
  `revision=${SDK_PRODUCER_LOCK.revision}`,
  `bundle_manifest_url=${SDK_PRODUCER_LOCK.urls.bundleManifest}`,
  `bundle_archive_url=${SDK_PRODUCER_LOCK.urls.bundleArchive}`,
];

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
} else {
  process.stdout.write(`${lines.join("\n")}\n`);
}
