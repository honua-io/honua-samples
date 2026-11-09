import { serverEnv } from "../lib/admin-api.mjs";
import { fetchSnapshot } from "./snapshot.mjs";
import { stageSnapshot } from "./import.mjs";
import { activateDeployment, saveDeployment } from "./deployment.mjs";
import { propertyApp } from "./property-app.mjs";

async function run(command, options) {
  const { name, directory } = options;
  if (command === "fetch") return fetchSnapshot(name, directory);
  const env = serverEnv();
  if (command === "property-app") return propertyApp(env, directory);
  if (command === "activate") return activateDeployment(env, options);
  const connection = process.env.HONUA_SAMPLE_CONNECTION;
  const staged = await stageSnapshot(env, { ...options, connection });
  return saveDeployment(env, { staged, directory, connection });
}

const [command, name, directory, ...extra] = process.argv.slice(2);
try {
  if (!name || !directory || extra.length || !["fetch", "stage", "activate", "property-app"].includes(command)
    || (command === "property-app" && name !== "maui")) {
    throw new Error("Usage: node scripts/state-local/cli.mjs <fetch|stage|activate> <source> <snapshot-directory>, or property-app maui <snapshot-directory>");
  }
  const result = await run(command, { name, directory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
