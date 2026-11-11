import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { approvedSources } from './sources.mjs';
import { fetchMauiSnapshot, readMauiSnapshot } from '../maui-snapshot.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/state-local/approved/fetch.mjs <receipt-directory>');
await mkdir(directory, { recursive: true });
const entries = Object.entries(approvedSources);
for (let index = 0; index < entries.length; index += 4) {
  const results = await Promise.allSettled(entries.slice(index, index + 4).map(async ([name, source]) => {
    const options = { name, source, directory };
    const exists = await access(path.join(directory, `${name}.receipt.json`)).then(() => true, () => false);
    if (!exists) await fetchMauiSnapshot(options);
    const snapshot = await readMauiSnapshot(options);
    console.log(`${name}: ${snapshot.geojson.features.length} verified features`);
    return [name, snapshot.receipt];
  }));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}
await writeFile(path.join(directory, 'sources.json'), JSON.stringify(approvedSources, null, 2));
