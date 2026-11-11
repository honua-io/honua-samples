import { mauiBounds, mauiSources } from '../maui-sources.mjs';

const wide = [-156.535, 20.855, -156.42, 20.915];
const parcelBounds = [-156.49, 20.875, -156.462, 20.895];
const portal = 'https://geodata.hawaii.gov/arcgis/rest/services/';
function existing(name, fields) {
  const source = mauiSources[`maui-${name}`];
  return { ...source, fields: fields ?? source.fields, bounds: wide,
    displayGeometry: { maxAllowableOffset: 0.00001, geometryPrecision: 6 } };
}
function backdrop(endpoint, fields) {
  const url = `${portal}${endpoint}`;
  return { ...existing('zoning'), id: endpoint, url, fields: ['objectid', ...fields],
    metadataUrl: `${url}?f=pjson`, attribution: 'Hawaii Statewide GIS Program; originating agencies identified in source metadata' };
}
export const approvedSources = {
  parcels: { ...existing('parcels', [...mauiSources['maui-parcels'].fields,
    'landvalue', 'bldgvalue', 'homeowner', 'taxacres', 'nhoodcode', 'pittcode']), bounds: parcelBounds },
  zoning: existing('zoning'), roads: existing('roads'), dfirm: existing('flood-hazard'),
  tsunami: { ...existing('tsunami-zones'), ...backdrop('Hazards/MapServer/11',
    ['zone_type', 'zone_desc', 'zone_code', 'evac_zone', 'mapname']) },
  slr32: existing('sea-level-rise'), fire: existing('fire-stations'), schools: existing('public-schools'),
  places: existing('place-names'), slud: existing('state-land-use'), sma: existing('special-management-area'),
  mip_growth: existing('island-plan-growth-boundaries'),
  bridges: existing('bridges', [...mauiSources['maui-bridges'].fields,
    'location_009', 'adt_029', 'lowest_rating', 'structure_len_mt_049']),
  coastline: { ...backdrop('Terrestrial/MapServer/3', ['isle']), where: "isle = 'Maui'" },
  contours: backdrop('Elevation/MapServer/5', ['contour']),
  streams: backdrop('FreshWater/MapServer/1', ['stream_nam', 'type']),
  waterbodies: backdrop('FreshWater/MapServer/19', ['gnis_name']),
  council: backdrop('AdminBnd/MapServer/35', ['districtnumber', 'district', 'councilmember']),
  police: backdrop('EmergMgmtPubSafety/MapServer/5', ['station_name', 'district', 'full_address']),
  hospitals: backdrop('Infrastructure/MapServer/5', ['name', 'address_addressline1', 'facilitytype_name']),
};

export const islandSources = Object.fromEntries(Object.entries(approvedSources).map(([name, source]) => [name, {
  ...source, bounds: mauiBounds,
  displayGeometry: { maxAllowableOffset: 0.00001, geometryPrecision: 15 },
}]));

export const islandTileLayers = ['parcels', 'zoning', 'dfirm', 'tsunami', 'roads', 'contours'];
