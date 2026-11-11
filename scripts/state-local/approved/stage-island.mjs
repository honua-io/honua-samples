import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverEnv } from '../../lib/admin-api.mjs';
import { ensureConnection } from '../../lib/sample-connection.mjs';
import { ensureDepartments } from '../departments.mjs';
import { stageVerifiedSnapshot, sourceLicense } from '../import.mjs';
import { verifyLayer, saveDeployment, readDeployment, receiptPath } from '../deployment.mjs';
import { islandSources } from './sources.mjs';
import { readIslandSnapshot } from './island-snapshot.mjs';

export async function readIslandDeployment(env, options) {
  const { directory, name, connection, cleanSha256 } = options;
  const receipt = await readDeployment(env, { name, directory, snapshotReceipt: { cleanSha256 } });
  if (receipt.connection !== connection) throw new Error(`${name} deployment does not match this connection`);
  Object.assign(receipt, sourceLicense(islandSources[name]));
  const { layer } = await verifyLayer(env, receipt);
  if (layer.enabled !== false) throw new Error(`${name} staged layer must remain disabled`);
  return receipt;
}

async function stageLayer(env, options) {
  const { name, directory, connection, snapshot } = options;
  const filename = receiptPath(directory, name);
  try {
    await stat(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const staged = await stageVerifiedSnapshot(env, { name, connection, ...snapshot });
    return saveDeployment(env, { staged, directory, connection, snapshotReceipt: snapshot.receipt });
  }
  return readIslandDeployment(env, { name, directory, connection, cleanSha256: snapshot.receipt.cleanSha256 });
}

export async function stageIsland(env, options) {
  const { directory, sourceDirectory, deploymentDirectory, connection } = options;
  if (!connection) throw new Error('HONUA_SAMPLE_CONNECTION is required');
  const snapshots = [];
  for (const name of Object.keys(islandSources)) {
    snapshots.push({ name, snapshot: await readIslandSnapshot({ name, directory, sourceDirectory }) });
  }
  await mkdir(deploymentDirectory, { recursive: true });
  await ensureConnection(env, connection);
  await ensureDepartments(env);
  for (const entry of snapshots) {
    const receipt = await stageLayer(env, { ...entry, directory: deploymentDirectory, connection });
    console.log(`${entry.name}: disabled Honua layer ${receipt.layerId}; verified department, licence and checksum`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceDirectory, directory, deploymentDirectory] = process.argv.slice(2);
  if (!sourceDirectory || !directory || !deploymentDirectory) {
    throw new Error('Usage: node stage-island.mjs <source-snapshots> <prepared-snapshots> <deployment-directory>');
  }
  await stageIsland(serverEnv(), { sourceDirectory, directory, deploymentDirectory,
    connection: process.env.HONUA_SAMPLE_CONNECTION });
}
