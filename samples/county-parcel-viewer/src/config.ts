import { stateLocalServer } from "../../../shared/state-local/server.mjs";

export const OFFLINE_FIXTURE = import.meta.env.MODE === "fixture";
export const DISPLAY_SNAPSHOT = import.meta.env.VITE_STATE_LOCAL_SNAPSHOT === "1";
// Where the viewer reads its data. Every default is on the one Honua server
// chosen at build time (shared/state-local/server.mjs); URL parameters point the same app at another server or at
// a county's own layers (design R9, R20):
//
//   baseUrl         Honua server for every default below
//   parcelsUrl      FeatureServer layer with tmk_txt, gisacres, taxacres, qpub_link
//   zoningUrl       FeatureServer layer with zone_code and zone_dist
//   floodUrl        FeatureServer layer with fld_zone
//   parcelTilesUrl  PMTiles archive of parcel outlines (source-layer "layer");
//                   "none" turns the outlines off (click-to-identify still works)
//   basemap         "none" skips the server's PMTiles basemap
//   tmk             the selected parcel (9 digits)

export const DEFAULT_BASE_URL = stateLocalServer;
// A downtown Wailuku parcel (B-3 Business, 100%): the first load shows a full
// zoning and flood result rather than an empty zoning match.
export const EXAMPLE_TMK = "234008053";

/** URL parameters that choose data, carried into every share link. */
export const PLANNING_PARAMS = ["stateLandUseUrl", "smaUrl", "growthBoundariesUrl", "growthAreasUrl", "tsunamiUrl", "seaLevelRiseUrl"] as const;
export type PlanningKey = typeof PLANNING_PARAMS[number];
export const LAYER_PARAMS = ["baseUrl", "parcelsUrl", "zoningUrl", "floodUrl", "parcelTilesUrl", "buildingsUrl", "basemap", ...PLANNING_PARAMS] as const;

export interface ViewerConfig {
  readonly baseUrl: string;
  readonly parcelsUrl: string;
  readonly zoningUrl: string;
  readonly floodUrl: string;
  /** null when outlines are turned off. */
  readonly parcelTilesUrl: string | null;
  readonly buildingsUrl: string | null;
  /** null when the basemap is turned off. */
  readonly basemapUrl: string | null;
  readonly geocoderLocator: string;
  /** Receipt-bound planning layers; absent means not deployed, never no restriction. */
  readonly planning: Readonly<Record<PlanningKey, string | null>>;
}

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

export function readConfig(params: URLSearchParams): ViewerConfig {
  if (OFFLINE_FIXTURE) return fixtureConfig();
  if (DISPLAY_SNAPSHOT) return displayConfig();
  const baseUrl = trimSlash(params.get("baseUrl") || DEFAULT_BASE_URL);
  const tiles = params.get("parcelTilesUrl");
  const buildings = params.get("buildingsUrl");
  return {
    baseUrl,
    parcelsUrl: trimSlash(params.get("parcelsUrl") || `${baseUrl}/rest/services/maui-parcels/FeatureServer/1`),
    zoningUrl: trimSlash(params.get("zoningUrl") || `${baseUrl}/rest/services/maui-zoning/FeatureServer/2`),
    floodUrl: trimSlash(params.get("floodUrl") || `${baseUrl}/rest/services/maui-flood-hazard/FeatureServer/4`),
    parcelTilesUrl: tiles === "none" ? null : trimSlash(tiles || `${baseUrl}/api/v1/tiles/pmtiles/maui-parcels-static`),
    buildingsUrl: buildings === "none" ? null : trimSlash(buildings || `${baseUrl}/api/v1/tiles/pmtiles/maui-buildings-static`),
    basemapUrl: params.get("basemap") === "none" ? null : `${baseUrl}/api/v1/tiles/pmtiles/maui-basemap`,
    geocoderLocator: "World",
    planning: Object.fromEntries(PLANNING_PARAMS.map((key) => [key, params.get(key) ? trimSlash(params.get(key)!) : null])) as ViewerConfig["planning"],
  };
}

function displayConfig(): ViewerConfig {
  const snapshot = (name: string) => new URL(`../data/${name}.geojson`, location.href).href;
  const names = ["maui-state-land-use", "maui-special-management-area", "maui-island-plan-growth-boundaries",
    "maui-island-plan-growth-areas", "maui-tsunami-zones", "maui-sea-level-rise"];
  return { baseUrl: location.origin, parcelsUrl: snapshot("maui-parcels"), zoningUrl: snapshot("maui-zoning"),
    floodUrl: snapshot("maui-flood-hazard"), parcelTilesUrl: null, buildingsUrl: null, basemapUrl: null,
    geocoderLocator: "World", planning: Object.fromEntries(PLANNING_PARAMS.map((key, index) => [key, snapshot(names[index])])) as ViewerConfig["planning"] };
}

function fixtureConfig(): ViewerConfig {
  const baseUrl = location.origin;
  return { baseUrl, parcelsUrl: `${baseUrl}/rest/services/maui-parcels/FeatureServer/1`,
    zoningUrl: `${baseUrl}/rest/services/maui-zoning/FeatureServer/2`,
    floodUrl: `${baseUrl}/rest/services/maui-flood-hazard/FeatureServer/4`,
    parcelTilesUrl: null, buildingsUrl: null, basemapUrl: null, geocoderLocator: "World",
    planning: Object.fromEntries(PLANNING_PARAMS.map((key) => [key, null])) as ViewerConfig["planning"] };
}
