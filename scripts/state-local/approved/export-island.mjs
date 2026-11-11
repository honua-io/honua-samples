import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverEnv } from '../../lib/admin-api.mjs';
import { sha256 } from '../../lib/checksum.mjs';
import { exportTileArchive } from '../tile-archive.mjs';
import { withTemporaryLayer } from '../deployment.mjs';
import { mauiBounds } from '../maui-sources.mjs';
import { islandSources, islandTileLayers } from './sources.mjs';
import { readIslandSnapshot } from './island-snapshot.mjs';
import { readIslandDeployment } from './stage-island.mjs';

const extent = { bbox: mauiBounds, minZoom: 8, maxZoom: 14 };

async function existingArchive(directory, layer) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(path.join(directory, `${layer.source}.tiles.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const bytes = await readFile(path.join(directory, `${layer.source}.pmtiles`));
  if (receipt.format !== 'honua.samples.island-tiles.v1' || receipt.source !== layer.source
    || receipt.cleanSha256 !== layer.cleanSha256 || receipt.sha256 !== sha256(bytes)
    || receipt.sizeBytes !== bytes.length || receipt.minZoom !== extent.minZoom
    || receipt.maxZoom !== extent.maxZoom || JSON.stringify(receipt.bbox) !== JSON.stringify(extent.bbox)) {
    throw new Error(`${layer.source} existing tile archive does not match this prepared snapshot`);
  }
  return receipt;
}

async function exportLayer(env, options) {
  const { layer, outputDirectory, localStorageRoot } = options;
  const existing = await existingArchive(outputDirectory, layer);
  if (existing) return existing;
  const filename = path.join(outputDirectory, `${layer.source}.pmtiles`);
  try {
    await stat(filename);
    throw new Error(`${layer.source} archive exists without a receipt; inspect it before retrying`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = await withTemporaryLayer(env, layer, () => exportTileArchive(env,
    { ...extent, serviceId: layer.serviceName, layerId: layer.layerId, localStorageRoot }));
  const source = islandSources[layer.source];
  const receipt = { format: 'honua.samples.island-tiles.v1', source: layer.source,
    cleanSha256: layer.cleanSha256, license: source.license, licenseUrl: source.licenseUrl,
    attribution: source.attribution, sourceUrl: source.url, ...result.receipt };
  await writeFile(filename, result.bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(outputDirectory, `${layer.source}.tiles.json`), JSON.stringify(receipt, null, 2),
    { flag: 'wx', mode: 0o600 });
  return receipt;
}

export async function exportIsland(env, options) {
  if (!options.connection) throw new Error('HONUA_SAMPLE_CONNECTION is required');
  const layers = [];
  for (const name of islandTileLayers) {
    const { receipt } = await readIslandSnapshot({ name, directory: options.directory,
      sourceDirectory: options.sourceDirectory });
    layers.push(await readIslandDeployment(env, { name, directory: options.deploymentDirectory,
      connection: options.connection, cleanSha256: receipt.cleanSha256 }));
  }
  await mkdir(options.outputDirectory, { recursive: true });
  for (const layer of layers) {
    const receipt = await exportLayer(env, { layer, outputDirectory: options.outputDirectory,
      localStorageRoot: options.localStorageRoot });
    console.log(`${layer.source}: ${receipt.sizeBytes} bytes; ${receipt.writtenTiles}/${receipt.totalTiles} tiles contain features; SHA-256 ${receipt.sha256}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceDirectory, directory, deploymentDirectory, outputDirectory] = process.argv.slice(2);
  if (!sourceDirectory || !directory || !deploymentDirectory || !outputDirectory) {
    throw new Error('Usage: node export-island.mjs <source-snapshots> <prepared-snapshots> <deployments> <tile-output>');
  }
  await exportIsland(serverEnv(), { sourceDirectory, directory, deploymentDirectory, outputDirectory,
    connection: process.env.HONUA_SAMPLE_CONNECTION, localStorageRoot: process.env.HONUA_TILE_STORAGE_ROOT });
}
