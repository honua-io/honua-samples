import { activeDeployment } from "./deployment.mjs";

export const propertyLayers = {
  "maui-parcels": "parcelsUrl",
  "maui-zoning": "zoningUrl",
  "maui-flood-hazard": "floodUrl",
  "maui-state-land-use": "stateLandUseUrl",
  "maui-special-management-area": "smaUrl",
  "maui-island-plan-growth-boundaries": "growthBoundariesUrl",
  "maui-island-plan-growth-areas": "growthAreasUrl",
  "maui-tsunami-zones": "tsunamiUrl",
  "maui-sea-level-rise": "seaLevelRiseUrl",
};

export async function propertyApp(env, directory) {
  const app = new URL("https://samples.honua.io/county-parcel-viewer/app/");
  const deployments = [];
  for (const [name, parameter] of Object.entries(propertyLayers)) {
    const deployment = await activeDeployment(env, { name, directory });
    app.searchParams.set(parameter, deployment.layerUrl);
    deployments.push(deployment);
  }
  app.searchParams.set("baseUrl", deployments[0].baseUrl);
  app.searchParams.set("parcelTilesUrl", "none");
  return { appUrl: app.href, sources: deployments.map(({ source, cleanSha256, layerUrl }) => ({ source, cleanSha256, layerUrl })) };
}
