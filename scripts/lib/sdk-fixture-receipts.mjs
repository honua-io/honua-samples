import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlobSha1 = (bytes) => createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");

export async function validateSdkFixtureReceipts(receipt, { root, readFileFn = readFile } = {}) {
  const readVerified = async (entry, bytesKey, digestKey) => {
    const bytes = Buffer.from(await readFileFn(path.join(root, entry.localPath)));
    assertEqual(bytes.byteLength, entry[bytesKey], `${entry.localPath} byte length`);
    assertEqual(sha256(bytes), entry[digestKey], `${entry.localPath} SHA-256`);
    assertEqual(gitBlobSha1(bytes), entry.gitBlobSha1, `${entry.localPath} Git blob SHA-1`);
    return bytes;
  };

  const cog = receipt.claims["imagery-cog-quickstart"];
  const inflated = [];
  for (const chunk of cog.chunks) {
    const stored = await readVerified(chunk, "storedBytes", "storedSha256");
    const raw = inflateRawSync(stored);
    assertEqual(raw.byteLength, chunk.inflatedBytes, `${chunk.localPath} inflated length`);
    assertEqual(sha256(raw), chunk.inflatedSha256, `${chunk.localPath} inflated SHA-256`);
    inflated.push(raw);
  }
  const cogBytes = Buffer.concat(inflated);
  assertEqual(cogBytes.byteLength, cog.bytes, "imagery COG byte length");
  assertEqual(sha256(cogBytes), cog.sha256, "imagery COG SHA-256");

  const columnar = receipt.claims["columnar-query-quickstart"];
  await readVerified(columnar, "bytes", "sha256");
  for (const sidecar of columnar.sidecars ?? []) await readVerified(sidecar, "bytes", "sha256");

  const coverages = receipt.claims["coverages-wcs-basic"];
  const source = await readVerified(coverages, "sourceBytes", "sourceSha256");
  const sourceText = source.toString("utf8");
  for (const expected of [
    `width: ${coverages.image.width}`,
    `height: ${coverages.image.height}`,
    `FIXTURE_IMAGE_BYTE_LENGTH = ${String(coverages.image.bytes).replace(/(\d)(?=(\d{3})+$)/gu, "$1_")}`,
    `FIXTURE_IMAGE_SHA256 = "${coverages.image.sha256}"`,
  ]) {
    if (!sourceText.includes(expected)) throw new Error(`coverage producer source omits ${expected}`);
  }
  const png = createCoveragePng(coverages.image.width, coverages.image.height);
  assertEqual(png.byteLength, coverages.image.bytes, "coverage PNG byte length");
  assertEqual(sha256(png), coverages.image.sha256, "coverage PNG SHA-256");

  return {
    imagery: { bytes: cogBytes.byteLength, sha256: sha256(cogBytes) },
    columnar: { bytes: columnar.bytes, sha256: columnar.sha256 },
    coverage: { bytes: png.byteLength, sha256: sha256(png) },
  };
}

function createCoveragePng(width, height) {
  const legend = [[18, 65, 67], [33, 112, 94], [122, 155, 84], [221, 174, 82], [238, 225, 181]];
  const scanlines = new Uint8Array(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    scanlines[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const terrain = (x / (width - 1)) * 2.4 + ((height - 1 - y) / (height - 1)) * 1.4 + ((Math.sin(x / 21) + 1) * 0.35 + 0.5);
      const color = legend[Math.max(0, Math.min(legend.length - 1, Math.floor(terrain)))];
      scanlines.set([...color, 255], offset);
      offset += 4;
    }
  }
  const ihdr = concat(u32(width), u32(height), Uint8Array.of(8, 6, 0, 0, 0));
  return concat(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", ihdr), chunk("IDAT", deflateStored(scanlines)), chunk("IEND", new Uint8Array()));
}

function u32(value) { return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value); }
function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function adler32(bytes) {
  let a = 1; let b = 0;
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat(typeBytes, data);
  return concat(u32(data.length), body, u32(crc32(body)));
}
function deflateStored(bytes) {
  const blocks = [Uint8Array.of(0x78, 0x01)];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const length = Math.min(65535, bytes.length - offset);
    const complement = ~length & 0xffff;
    blocks.push(Uint8Array.of(offset + length === bytes.length ? 1 : 0, length & 0xff, length >>> 8, complement & 0xff, complement >>> 8), bytes.slice(offset, offset + length));
  }
  blocks.push(u32(adler32(bytes)));
  return concat(...blocks);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}
