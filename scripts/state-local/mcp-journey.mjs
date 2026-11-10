import { readFile } from "node:fs/promises";
import { activeDeployment } from "./deployment.mjs";
import { getSource } from "./sources.mjs";

const scenarios = JSON.parse(await readFile(new URL("./sdk/scenarios.json", import.meta.url), "utf8"));
const questions = {
  property: "Choose one parcel and report its TMK and intersecting mapped zoning districts. Cite the parcel and zoning feature IDs. Direct me to the county's official Maui MAPPS instructions for checking permits manually; report any unverified TMK formatting as a gap. Do not invent permits, CPR digits or a legal determination.",
  "311": "Which exercise districts have the most open drainage service requests? Report counts by district and status with the exact filter, source and feature IDs. These districts are fictional exercise groupings, not official wards.",
  emergency: "Which open exercise shelters have remaining capacity? Report capacity minus occupancy, status and feature IDs. These are fictional activations at real locations, not an official list of designated or currently operating shelters.",
  "public-works": "Which exercise work orders are scheduled, and what are their crews and stages? Cite each work order and its linked asset ID. Do not change the work orders or claim they are municipal maintenance records.",
};

function scenarioSources(name) {
  const scenario = Object.hasOwn(scenarios, name) && scenarios[name];
  if (!scenario) throw new Error("Choose property, emergency, 311 or public-works");
  return name === "property" ? ["maui-parcels", scenario.source] : [scenario.source];
}

function publicSource(deployment) {
  const { source, cleanSha256, layerUrl, baseUrl, layerId } = deployment;
  const url = new URL(layerUrl);
  const base = new URL(baseUrl);
  const match = url.pathname.match(/^\/rest\/services\/([^/]+)\/([^/]+)\/FeatureServer\/(\d+)$/);
  if (url.origin !== base.origin || url.username || url.password || url.search || url.hash
    || base.username || base.password || base.search || base.hash || base.pathname !== "/"
    || !["https:", "http:"].includes(url.protocol) || !match || Number(match[3]) !== layerId
    || deployment.enabled !== true || !Number.isSafeInteger(layerId) || layerId < 0 || !/^[a-f0-9]{64}$/.test(cleanSha256)) {
    throw new Error("MCP source requires a credential-free public layer URL and snapshot checksum");
  }
  const definition = getSource(source);
  const service = match.slice(1, 3).map(decodeURIComponent).join("/");
  return { source, cleanSha256, layerUrl, reference: `geoservices-feature-service:${service}/${layerId}`,
    attribution: definition.attribution, license: definition.license, licenseUrl: definition.licenseUrl };
}

export function buildMcpJourney(name, deployments) {
  const expected = scenarioSources(name);
  if (deployments.length !== expected.length || deployments.some((entry, index) => entry.source !== expected[index])
    || new Set(deployments.map((entry) => entry.baseUrl)).size !== 1) {
    throw new Error("MCP deployments do not match the scenario sources and server");
  }
  const sources = deployments.map(publicSource);
  const scenario = scenarios[name];
  const prompt = `${questions[name]}\nUse only these sources: ${sources.map((entry) => entry.reference).join(", ")}.\n`
    + `Starting filter for ${scenario.source}: ${scenario.where}. Read the schema first; paginate completely before reporting totals. `
    + "If a spatial join or required field is unavailable, report the gap rather than infer an answer. Use read-only tools only. "
    + "Return sources, filters, feature IDs and limitations with the answer. "
    + (scenario.exercise ? "Label the answer DEMO DATA. Preserve data_origin=synthetic_demo, is_demo=true and exercise_only=true in returned records and exports." : "Mapped zoning is informational; the county is the system of record.");
  return { format: "honua.samples.mcp-journey.v1", scenario: name, requirement: scenario.requirement,
    status: "setup-only; agent journey not executed", sources, prompt,
    clientConfig: { mcpServers: { honua: { command: "npx",
      args: ["-y", "-p", "@honua/sdk-js@0.3.2", "-p", "@honua/mcp-server@0.3.0", "honua-mcp"],
      env: { HONUA_BASE_URL: deployments[0].baseUrl, HONUA_TRANSPORT: "rest", HONUA_API_KEY: "" } } } } };
}

export async function mcpJourney(env, options) {
  const deployments = [];
  for (const name of scenarioSources(options.name)) {
    deployments.push(await activeDeployment(env, { name, directory: options.directory }));
  }
  return buildMcpJourney(options.name, deployments);
}
