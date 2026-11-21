import { toMapLibreExtrusionLayer, type SceneExtrusionPrimitive } from "@honua/app-platform/scene-workspace";
import type { Map, FillExtrusionLayerSpecification } from "maplibre-gl";
import { SharedPromiseCache, type PMTiles } from "pmtiles";
import { token, reducedMotion } from "./dom.js";

const BUILDINGS = "overture-buildings";
const CREDIT = 'Buildings: <a href="https://overturemaps.org/">Overture Maps Foundation</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>';

interface BuildingOptions {
  readonly archiveUrl: string | null;
  archiveFor(url: string): PMTiles;
}

async function addBuildings(map: Map, options: BuildingOptions, isDisposed: () => boolean): Promise<boolean> {
  if (map.getLayer(BUILDINGS)) return true;
  if (!options.archiveUrl) return false;
  const archive = options.archiveFor(options.archiveUrl);
  try {
    await archive.getHeader();
  } catch (error) {
    // Failed header promises stay cached; the next user retry needs a fresh read.
    archive.cache = new SharedPromiseCache();
    throw error;
  }
  if (isDisposed() || !map.style) return false;
  if (!map.getSource(BUILDINGS)) map.addSource(BUILDINGS, {
    type: "vector", url: `pmtiles://${options.archiveUrl}`, attribution: CREDIT,
  });
  const primitive: SceneExtrusionPrimitive = {
    kind: "extrusion", id: BUILDINGS, sourceId: BUILDINGS, sourceLayer: "layer",
    height: ["get", "render_height"], base: 0, opacity: 0.82,
    color: token("--map-select"),
  };
  const layer = toMapLibreExtrusionLayer(primitive) as FillExtrusionLayerSpecification;
  const before = map.getLayer("parcel-selected-line") ? "parcel-selected-line" : map.getLayer("parcel-selected-geo-line") ? "parcel-selected-geo-line" : undefined;
  map.addLayer({ ...layer, minzoom: 12 }, before);
  return true;
}

export function installBuildingControl(map: Map, options: BuildingOptions): void {
  if (!options.archiveUrl) return;
  const group = document.createElement("div");
  group.className = "maplibregl-ctrl maplibregl-ctrl-group building-control";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "3D";
  button.setAttribute("aria-label", "Show 3D buildings");
  button.setAttribute("aria-pressed", "false");
  const note = document.createElement("p");
  note.className = "building-note";
  note.setAttribute("role", "status");
  note.hidden = true;
  let active = false;
  let disposed = false;
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) disposed = true; };
  window.addEventListener("pagehide", onPageHide);
  button.addEventListener("click", async () => {
    button.disabled = true;
    note.hidden = false;
    note.textContent = "Loading building footprints…";
    try {
      const mounted = await addBuildings(map, options, () => disposed);
      if (!mounted || disposed || !map.style) return;
      active = !active;
      map.setLayoutProperty(BUILDINGS, "visibility", active ? "visible" : "none");
      map.easeTo({ pitch: active ? 55 : 0, duration: reducedMotion() ? 0 : 500 });
      button.textContent = active ? "2D" : "3D";
      button.setAttribute("aria-label", active ? "Show 2D map" : "Show 3D buildings");
      button.setAttribute("aria-pressed", String(active));
      note.textContent = "Overture buildings · Heights use reported metres, floors × 3 m, or a 4 m estimate. Not surveyed elevations.";
      note.hidden = !active;
    } catch {
      if (!disposed) note.textContent = "Buildings could not load. Select 3D to retry; parcel lookup still works.";
    } finally {
      if (!disposed) button.disabled = false;
    }
  });
  group.append(button);
  map.addControl({
    onAdd() { map.getContainer().parentElement?.append(note); return group; },
    onRemove() { disposed = true; window.removeEventListener("pagehide", onPageHide); group.remove(); note.remove(); },
  }, "top-right");
}
