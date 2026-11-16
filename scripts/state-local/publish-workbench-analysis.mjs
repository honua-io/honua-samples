import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runAnalysis, validateManifest } from '../../shared/state-local/workbench-analytics.mjs';

// Publish only named, validated public artifacts. Never recursively copy an operator directory.
export async function publishWorkbenchAnalysis(source, destination) {
  const manifest = validateManifest(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')));
  const files = new Map();
  const names = Object.values(manifest.operations).flatMap(config => [config.recording, config.agentRecording].filter(Boolean));
  for (const name of names) {
    if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('Analysis artifact names must be local JSON basenames');
    files.set(name, await readFile(path.join(source, name), 'utf8'));
  }
  const base = 'https://demo.honua.io/';
  for (const key of Object.keys(manifest.operations)) {
    if (!manifest.operations[key].recording) continue;
    const result = await runAnalysis(manifest, key, { base, fetcher: async (url) => {
      const raw = files.get(path.posix.basename(new URL(url).pathname));
      return new Response(raw ?? '', { status: raw === undefined ? 404 : 200 });
    } });
    if (result.agentError) throw new Error(result.agentError);
  }
  await mkdir(destination, { recursive: true });
  for (const [name, raw] of files) await writeFile(path.join(destination, name), raw);
  await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
