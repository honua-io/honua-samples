// Installed before application scripts in every frame. Capture public MapLibre constructors,
// including maps kept in a closure, without changing app source or requiring credentials.
export function captureMaps() {
  window.__galleryHealthMaps = [];
  let library;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get: () => library,
    set(value) {
      library = value;
      if (!value?.Map) return;
      const Original = value.Map;
      value.Map = new Proxy(Original, {
        construct(target, args, newTarget) {
          const map = Reflect.construct(target, args, newTarget);
          window.__galleryHealthMaps.push(map);
          return map;
        },
      });
    },
  });
}

// Runs in a frame. Count visible, rendered application features, never just loaded tiles
// or a nonempty canvas. GeoJSON and PMTiles layers both pass through this assertion.
export function renderedMapEvidence() {
  const maps = [...new Set([
    ...(window.__galleryHealthMaps ?? []), ...(window.HM?.maps ?? []), window.sampleMap,
  ].filter(Boolean))];
  const evidence = maps.filter((map) => map.getCanvas?.().getBoundingClientRect().width > 0).map((map) => {
    const style = map.getStyle?.();
    const basemapLayers = new Set(map.basemapLayers ?? []);
    const layers = (style?.layers ?? []).filter((layer) => {
      const source = style.sources?.[layer.source];
      return !basemapLayers.has(layer.id) && source && ['vector', 'geojson'].includes(source.type)
        && !/^(basemap|base|protomaps|openmaptiles|osm)([-_]|$)/i.test(layer.source)
        && !/basemap|protomaps|openmaptiles/i.test(String(source.url ?? ''));
    }).map((layer) => layer.id);
    return { layers, features: layers.length ? map.queryRenderedFeatures({ layers }).length : 0 };
  });
  // Leaflet's SVG renderer exposes actual feature paths; tile images alone cannot pass.
  // Lines may have zero width or height; either dimension counts.
  const leafletFeatures = [...document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
    .filter((node) => { const bounds = node.getBoundingClientRect(); return bounds.width > 0 || bounds.height > 0; }).length;
  return { maps: evidence, leafletFeatures,
    painted: evidence.some((map) => map.features > 0) || leafletFeatures > 0 };
}

export const MAP_CONTAINER_SELECTOR = '.maplibregl-map, .leaflet-container, canvas';
export const VISIBLE_MAP_SELECTOR = `${MAP_CONTAINER_SELECTOR}, div#map, div[id$="-map"]`;

// Passed to frame.evaluate on its own. A function that Playwright sends into the
// page cannot call a module helper, so this predicate stays inside this function.
// display:none maps still insert a canvas. Only a laid-out container must paint.
export function countLaidOut(selector) {
  return [...document.querySelectorAll(selector)].filter((node) => {
    const bounds = node.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }).length;
}
