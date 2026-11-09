import { serverEnv } from "../lib/admin-api.mjs";
import { fetchSnapshot } from "./snapshot.mjs";
import { stageSnapshot } from "./import.mjs";

const [command, name, directory, ...extra] = process.argv.slice(2);
try {
  if (!name || !directory || extra.length || !["fetch", "stage"].includes(command)) {
    throw new Error("Usage: node scripts/state-local/cli.mjs <fetch|stage> <source> <fresh-directory>");
  }
  const result = command === "fetch" ? await fetchSnapshot(name, directory)
    : await stageSnapshot(serverEnv(), { name, directory, connection: process.env.HONUA_SAMPLE_CONNECTION });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
