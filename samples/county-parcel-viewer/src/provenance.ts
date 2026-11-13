import { DISPLAY_SNAPSHOT, OFFLINE_FIXTURE, type ViewerConfig } from "./config.js";
import { h } from "./dom.js";

function sourceLink(label: string, value: string): HTMLElement {
  try {
    const url = new URL(value, location.href);
    if (["http:", "https:"].includes(url.protocol)) {
      return h("a", { href: url.href, target: "_blank", rel: "noopener noreferrer" }, label);
    }
  } catch { /* Invalid configured URLs must not prevent the disclosure from rendering. */ }
  return h("span", {}, `${label}: source link unavailable`);
}

export function provenancePanel(config: ViewerConfig): HTMLElement {
  const archive = config.parcelTilesUrl !== null;
  const mode = OFFLINE_FIXTURE ? "Synthetic fixture · no county records" : DISPLAY_SNAPSHOT
    ? "Local display snapshot · capture date unavailable" : archive
      ? "Archive outlines + live queries · dates unavailable" : "Live service queries · update dates unavailable";
  const explanation = OFFLINE_FIXTURE
    ? "Invented parcels, zoning and flood zones for software demonstrations. No live county data or real snapshot date."
    : DISPLAY_SNAPSHOT
      ? "Map, parcel details and planning results read bundled GeoJSON files. They do not show current service conditions."
      : archive
        ? "Background parcel outlines come from a PMTiles archive. Selected parcel geometry, details and planning results are queried separately from services; they may represent different versions."
        : "Selected parcel geometry, details and planning results are requested from services. A live request does not establish when the underlying records were updated.";
  const sources = h("ul", { class: "source-list" },
    h("li", {}, sourceLink(DISPLAY_SNAPSHOT ? "Parcel GeoJSON" : "Parcel query source", config.parcelsUrl)),
    h("li", {}, sourceLink("Zoning source", config.zoningUrl)),
    h("li", {}, sourceLink("Flood source", config.floodUrl)));
  if (config.parcelTilesUrl) sources.append(h("li", {}, sourceLink("Parcel outline archive (PMTiles)", config.parcelTilesUrl)));
  if (config.buildingsUrl) sources.append(h("li", {}, sourceLink("Building display archive (PMTiles)", config.buildingsUrl)));
  if (config.basemapUrl) sources.append(h("li", {}, sourceLink("Basemap display archive (PMTiles)", config.basemapUrl)));
  const planningNames: Record<string, string> = {
    stateLandUseUrl: "State land use", smaUrl: "Special management area", growthBoundariesUrl: "Growth boundaries",
    growthAreasUrl: "Growth areas", tsunamiUrl: "Tsunami evacuation", seaLevelRiseUrl: "Sea level rise",
  };
  for (const [name, url] of Object.entries(config.planning)) {
    if (url) sources.append(h("li", {}, sourceLink(planningNames[name] ?? name, url)));
  }
  return h("details", { id: "data-provenance", class: "data-provenance" },
    h("summary", {}, mode), h("p", {}, explanation),
    !OFFLINE_FIXTURE && h("p", {}, "Capture and update dates are unavailable: no verified source timestamps are configured. Do not use this demo as a current land-use or flood determination."),
    sources);
}
