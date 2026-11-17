#!/usr/bin/env node
// Fails when a published county page names a demo.honua.io publication
// descriptor that the host does not serve. samples#314 deployed while that
// GET returned 403; the browser smoke is not a required check.

import { realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_PATTERN = /https:\/\/demo\.honua\.io\/demo-data\/publications\/[A-Za-z0-9._~/-]+\/descriptor\.json/g;
const TEXT_EXTENSIONS = new Set([".mjs", ".js", ".html", ".md", ".css", ".json"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function hostedDescriptorUrls(text) {
  return [...new Set(text.match(URL_PATTERN) ?? [])];
}

/** @returns {string | null} a problem, or null when the body is a served descriptor */
export function assessDescriptorBody(status, body) {
  if (status !== 200) return `HTTP ${status}`;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "response is not a JSON object";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "response is not a JSON object";
  if (typeof parsed.publicationId !== "string" || parsed.publicationId.length === 0) return "descriptor has no publicationId";
  return null;
}

export async function collectHostedDescriptorUrls(root) {
  const urls = new Set();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      for (const url of hostedDescriptorUrls(await readFile(full, "utf8"))) urls.add(url);
    }
  }
  await walk(root);
  return [...urls];
}

async function checkRoot(directory) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) {
    console.error(`missing descriptor root: ${directory}`);
    return false;
  }
  const urls = await collectHostedDescriptorUrls(directory);
  if (urls.length === 0) {
    console.error(`no hosted county descriptor under ${directory}`);
    return false;
  }
  let ok = true;
  for (const url of urls) {
    let response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { accept: "application/json" },
      });
    } catch (error) {
      console.error(`${url} ${error.message}`);
      ok = false;
      continue;
    }
    const problem = assessDescriptorBody(response.status, await response.text());
    if (problem) {
      console.error(`${url} ${problem}`);
      ok = false;
    } else {
      console.log(`PASS ${url}`);
    }
  }
  return ok;
}

async function main() {
  const roots = process.argv.slice(2);
  const directories = (roots.length > 0 ? roots : ["shared/state-local"]).map((root) => path.resolve(REPO_ROOT, root));
  let ok = true;
  for (const directory of directories) {
    if (!await checkRoot(directory)) ok = false;
  }
  if (!ok) process.exit(1);
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
