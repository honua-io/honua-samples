const portalPolicy = "https://nola.gov/nola/media/CAO/Policy/No-AA135-Data-Policy.pdf";

function source(id, department, details) {
  return { id, department, ...details };
}

const cc0 = (attribution) => ({
  license: "CC0_10", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/legalcode", attribution,
});
const cityPolicy = (attribution) => ({ license: null, licenseUrl: portalPolicy, attribution });

export const sources = {
  parcels: source("v9q5-fz7t", "Planning", {
    fields: ["geopin", "situs_number", "situs_dir", "situs_street", "situs_type", "acres"],
    geometry: { field: "the_geom" }, ...cityPolicy("City of New Orleans — parcels; Policy 135 §V.2"),
  }),
  zoning: source("bizp-xi7c", "Planning", {
    fields: ["objectid", "zoneclass", "zonedesc", "zoneyear", "ordnum"],
    geometry: { field: "the_geom" }, ...cc0("City of New Orleans, City Planning Commission"),
  }),
  permits: source("rcm3-fn58", "Planning", {
    fields: ["numstring", "address", "pin", "type", "isclosed", "currentstatus", "filingdate", "issuedate"],
    geometry: { field: "location_1", kind: "location" }, ...cc0("City of New Orleans, Safety and Permits"),
  }),
  requests: source("2jgv-pqrq", "311", {
    fields: ["service_request", "request_type", "date_created", "case_close_date", "request_status", "address_councildis"],
    geometry: { longitude: "longitude", latitude: "latitude" }, ...cc0("Orleans Parish Communications District"),
  }),
  basins: source("se4p-ierc", "Public Works", {
    fields: ["objectid", "gisid", "cbtype", "stname", "neighborhood"],
    geometry: { field: "the_geom" }, ...cc0("City of New Orleans, Department of Public Works"),
  }),
  cleanings: source("2zer-6wpb", "Public Works", {
    fields: ["mdate", "neighborhood", "segmentid", "councildistrict", "lineflushed", "cbmaintid", "worktype"],
    geometry: { longitude: "x", latitude: "y" }, ...cityPolicy("City of New Orleans, Department of Public Works — Policy 135 §V.2"),
  }),
};

export const sourceCrs = "EPSG:4326";
export const coverageBounds = [-90.3, 29.8, -89.6, 30.2];

export function getSource(name) {
  if (!Object.hasOwn(sources, name)) throw new Error(`Unknown source ${name}; choose ${Object.keys(sources).join(", ")}`);
  return sources[name];
}
