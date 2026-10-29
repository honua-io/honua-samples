// Where the viewer reads its data. Every default is on the one Honua server
// (demo.honua.io); URL parameters point the same app at another server or at
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

export const DEFAULT_BASE_URL = "https://demo.honua.io";
export const EXAMPLE_TMK = "215010777";

/** URL parameters that choose data, carried into every share link. */
export const LAYER_PARAMS = ["baseUrl", "parcelsUrl", "zoningUrl", "floodUrl", "parcelTilesUrl", "basemap"] as const;

export interface ViewerConfig {
  readonly baseUrl: string;
  readonly parcelsUrl: string;
  readonly zoningUrl: string;
  readonly floodUrl: string;
  /** null when outlines are turned off. */
  readonly parcelTilesUrl: string | null;
  /** null when the basemap is turned off. */
  readonly basemapUrl: string | null;
  readonly geocoderLocator: string;
}

function trimSlash(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

export function readConfig(params: URLSearchParams): ViewerConfig {
  const baseUrl = trimSlash(params.get("baseUrl") || DEFAULT_BASE_URL);
  const tiles = params.get("parcelTilesUrl");
  return {
    baseUrl,
    parcelsUrl: trimSlash(params.get("parcelsUrl") || `${baseUrl}/rest/services/maui-parcels/FeatureServer/1`),
    zoningUrl: trimSlash(params.get("zoningUrl") || `${baseUrl}/rest/services/maui-zoning/FeatureServer/2`),
    floodUrl: trimSlash(params.get("floodUrl") || `${baseUrl}/rest/services/maui-flood-hazard/FeatureServer/4`),
    parcelTilesUrl: tiles === "none" ? null : trimSlash(tiles || `${baseUrl}/api/v1/tiles/pmtiles/maui-parcels-static`),
    basemapUrl: params.get("basemap") === "none" ? null : `${baseUrl}/api/v1/tiles/pmtiles/maui-basemap`,
    geocoderLocator: "World",
  };
}
