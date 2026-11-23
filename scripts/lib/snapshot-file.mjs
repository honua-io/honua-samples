// Committed fallback snapshots: write them only when their content changes,
// and never record a build machine's absolute path as their source.
import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A file:// URL inside the repository becomes a repository-relative path. */
export function portableSourceUrl(sourceUrl, repoRoot = REPO_ROOT) {
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("file:")) return sourceUrl;
  const relative = path.relative(repoRoot, fileURLToPath(sourceUrl));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return sourceUrl;
  return relative.split(path.sep).join("/");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function withoutFetchedAt(value) {
  if (!value || typeof value !== "object") return value;
  const { fetchedAt: _ignored, ...rest } = value;
  return rest;
}

/**
 * Writes `fields` with a fresh fetchedAt, unless the file already holds the
 * same fields; then the file (and its recorded fetchedAt) stays untouched.
 * Returns true when the file was written.
 */
export async function writeSnapshotIfChanged(filePath, fields) {
  const next = { ...fields, fetchedAt: new Date().toISOString() };
  const current = await readJson(filePath);
  if (current && isDeepStrictEqual(withoutFetchedAt(current), withoutFetchedAt(next))) return false;
  await writeFile(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return true;
}
