export const mauiBounds = [-157.4, 20.45, -155.95, 21.25];
const portal = 'https://geodata.hawaii.gov/arcgis/rest/services/';
const licenseUrl = 'https://planning.hawaii.gov/gis/download-gis-data-expanded/';

function source(endpoint, department, details) {
  return { id: endpoint, url: `${portal}${endpoint}`, department,
    license: 'public-domain', licenseUrl, bounds: mauiBounds,
    geometry: { field: 'the_geom' }, ...details };
}
const metadata = (file) => `https://files.hawaii.gov/dbedt/op/gis/data/${file}`;
const state = 'Hawaii Statewide GIS Program';
export const mauiSources = {
  'maui-parcels': source('ParcelsZoning/MapServer/30', 'Planning', {
    fields: ['objectid', 'tmk', 'tmk_txt', 'cty_tmk', 'gisacres', 'qpub_link'],
    metadataUrl: metadata('niparcels.pdf'), attribution: `County of Maui; ${state}`,
  }),
  'maui-zoning': source('ParcelsZoning/MapServer/33', 'Planning', {
    fields: ['objectid', 'zone_code', 'zone_dist', 'cp_area', 'island'],
    metadataUrl: metadata('cty_zoning_mau.pdf'), attribution: `County of Maui Department of Planning; ${state}`,
  }),
  'maui-state-land-use': source('ParcelsZoning/MapServer/20', 'Planning', {
    fields: ['objectid', 'ludcode', 'island', 'acres'],
    metadataUrl: metadata('slud.pdf'), attribution: `Hawaii State Land Use Commission; ${state}`,
  }),
  'maui-special-management-area': source('ParcelsZoning/MapServer/21', 'Planning', {
    fields: ['objectid', 'smarea', 'acres'],
    metadataUrl: metadata('sma.pdf'), attribution: `County of Maui Department of Planning; ${state}`,
  }),
  'maui-community-plan-areas': source('ParcelsZoning/MapServer/10', 'Planning', {
    fields: ['objectid', 'cp_year', 'designations', 'acres'],
    metadataUrl: metadata('CommPlanBndries_MauCty.pdf'), attribution: `County of Maui Department of Planning; ${state}`,
  }),
  'maui-island-plan-growth-boundaries': source('ParcelsZoning/MapServer/15', 'Planning', {
    fields: ['objectid', 'status', 'type'], metadataUrl: metadata('maui_island_plan.pdf'),
    attribution: `County of Maui Department of Planning; ${state}`,
  }),
  'maui-island-plan-growth-areas': source('ParcelsZoning/MapServer/16', 'Planning', {
    fields: ['objectid', 'name', 'status', 'type'], metadataUrl: metadata('maui_island_plan.pdf'),
    attribution: `County of Maui Department of Planning; ${state}`,
  }),
  'maui-roads': source('Transportation/MapServer/5', 'Public Works', {
    fields: ['objectid', 'fullname', 'roadclass', 'centerlineid', 'maintby', 'town_name'],
    metadataUrl: metadata('roads_mau.pdf'), attribution: `County of Maui Enterprise GIS Department; ${state}`,
  }),
  'maui-flood-hazard': source('Hazards/MapServer/4', 'Emergency Management', {
    fields: ['objectid', 'dfirm_id', 'fld_zone', 'zone_subty', 'sfha_tf', 'source_cit', 'static_bfe', 'v_datum', 'depth', 'len_unit'],
    metadataUrl: metadata('s_fld_haz_ar_state.pdf'), attribution: `Federal Emergency Management Agency; ${state}`,
  }),
  'maui-sea-level-rise': source('Climate/MapServer/45', 'Emergency Management', {
    fields: ['objectid', 'id'], metadataUrl: metadata('slr_exposure_area_3_pt_2_ft.html'),
    attribution: `University of Hawaii Coastal Geology Group; PacIOOS; Tetra Tech, Inc.; ${state}`,
  }),
  'maui-place-names': source('HistoricCultural/MapServer/2', 'Planning', {
    fields: ['objectid', 'feature_id', 'feature_name', 'feature_class', 'county_name'],
    metadataUrl: metadata('geonames.pdf'), attribution: `US Geographic Names Information System; ${state}`,
  }),
  'maui-fire-stations': source('EmergMgmtPubSafety/MapServer/7', 'Emergency Management', {
    fields: ['objectid', 'name', 'alt_name', 'island', 'status'],
    metadataUrl: metadata('Fire_Stations_All.pdf'),
    attribution: `Hawaii Department of Health EMS and Injury Prevention Systems Branch; ${state}`,
  }),
  'maui-tsunami-zones': source('Hazards/MapServer/2', 'Emergency Management', {
    fields: ['objectid', 'island', 'mapname', 'zone_type', 'zone_desc', 'tsu_evac', 'evac_zone'],
    metadataUrl: metadata('tsunevac.pdf'), attribution: `County of Maui; ${state}`,
  }),
  'maui-public-schools': source('Infrastructure/MapServer/7', 'Emergency Management', {
    fields: ['objectid', 'address', 'city', 'zip', 'website', 'island', 'sch_code', 'sch_name', 'sch_type'],
    metadataUrl: metadata('public_schools.pdf'), attribution: `Hawaii Department of Education; ${state}`,
  }),
};
