import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverEnv } from '../../lib/admin-api.mjs';
import { ensureConnection } from '../../lib/sample-connection.mjs';
import { ensureDepartments } from '../departments.mjs';
import { stageVerifiedSnapshot } from '../import.mjs';
import { verifyLayer } from '../deployment.mjs';
import { islandSources } from './sources.mjs';
import { readIslandSnapshot } from './island-snapshot.mjs';

export async function readIslandDeployment(env, options) {
  const { directory, name, connection, cleanSha256 } = options;
  const receipt = JSON.parse(await readFile(path.join(directory, `${name}.deployment.json`), 'utf8'));
  if (receipt.source !== name || receipt.baseUrl !== env.baseUrl || receipt.connection !== connection
    || receipt.cleanSha256 !== cleanSha256) throw new Error(`${name} deployment does not match this server and snapshot`);
  const { layer } = await verifyLayer(env, receipt);
  if (layer.enabled !== false) throw new Error(`${name} staged layer must remain disabled`);
  return receipt;
}

async function stageLayer(env, options) {
  const { name, directory, connection, snapshot } = options;
  const filename = path.join(directory, `${name}.deployment.json`);
  try {
    await readFile(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const staged = await stageVerifiedSnapshot(env, { name, connection, ...snapshot });
    const receipt = { ...staged, connection, baseUrl: env.baseUrl, createdAt: new Date().toISOString() };
    const { layer } = await verifyLayer(env, receipt);
    if (layer.enabled !== false) throw new Error(`${name} staged layer must remain disabled`);
    await writeFile(filename, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    return receipt;
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
