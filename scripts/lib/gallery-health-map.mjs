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
    const layers = (style?.layers ?? []).filter((layer) => {
      const source = style.sources?.[layer.source];
      return source && ['vector', 'geojson'].includes(source.type)
        && !/^(basemap|base|protomaps|openmaptiles|osm)([-_]|$)/i.test(layer.source)
        && !/basemap|protomaps|openmaptiles/i.test(String(source.url ?? ''));
    }).map((layer) => layer.id);
    return { layers, features: layers.length ? map.queryRenderedFeatures({ layers }).length : 0 };
  });
  // Leaflet's SVG renderer exposes actual feature paths; tile images alone cannot pass.
  const leafletFeatures = [...document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')]
    .filter((node) => { const bounds = node.getBoundingClientRect(); return bounds.width > 0 || bounds.height > 0; }).length;
  const containers = document.querySelectorAll('.maplibregl-map, .leaflet-container, canvas').length;
  return { containers, maps: evidence, leafletFeatures,
    painted: evidence.some((map) => map.features > 0) || leafletFeatures > 0 };
}

// SVG symbols such as i-map are icons, not map containers.
export function visibleMapContainers() {
  return [...document.querySelectorAll('.maplibregl-map, .leaflet-container, canvas, div#map, div[id$="-map"]')]
    .filter((node) => { const bounds = node.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; }).length;
}
