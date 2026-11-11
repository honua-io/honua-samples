/* Maui street basemap and Honua-native island archives. Story records remain
   separate GeoJSON sources so parcel selections retain their documented IDs. */
(function () {
  const root = new URL('/state-local/data/island/', location.origin);
  const tiled = new Set(['parcels', 'zoning', 'dfirm', 'tsunami', 'roads', 'contours']);
  const small = new Set(['slr32', 'council', 'waterbodies', 'streams', 'fire', 'schools', 'places', 'slud', 'sma', 'mip_growth', 'bridges', 'coastline', 'police', 'hospitals']);
  const bounds = [[-157.55, 20.25], [-155.65, 21.4]];
  let protocol;

  function register() {
    if (protocol) return;
    protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }

  // Chromium's HTTP cache can hand concurrent range reads of one static archive another request's bytes, and
  // pmtiles bypasses that cache only on Windows, so island archives bypass it on every Chromium browser.
  const chromium = /Chrome|Chromium|Edg|OPR|Brave/.test(navigator.userAgent);
  function islandArchive(url) {
    register();
    if (!protocol.get(url)) protocol.add(new pmtiles.PMTiles(Object.assign(new pmtiles.FetchSource(url), { chromeWindowsNoCache: chromium })));
    return 'pmtiles://' + url;
  }

  function source(name) {
    if (tiled.has(name)) return { type: 'vector', url: islandArchive(new URL(name + '.pmtiles', root).href) };
    if (small.has(name)) return { type: 'geojson', data: new URL(name + '.geojson', root).href };
    return null;
  }

  function layer(map, style, before) {
    if (style.source && map.getStyle().sources[style.source]?.type === 'vector' && !style['source-layer']) {
      style = { ...style, 'source-layer': 'layer' };
    }
    map.addLayer(style, before);
  }

  function streetLayer(map, style) {
    const { id, type, paint, ...options } = style;
    HM.themed(map, { id, type, source: 'streets', ...options, paint });
  }

  function streets(map) {
    map.addSource('streets', { type: 'vector', url: 'pmtiles://https://demo.honua.io/api/v1/tiles/pmtiles/maui-basemap' });
    streetLayer(map, { id: 'land', type: 'fill', 'source-layer': 'earth', paint: { 'fill-color': '--map-land' } });
    streetLayer(map, { id: 'street-parks', type: 'fill', 'source-layer': 'landuse', filter: ['in', ['get', 'kind'], ['literal', ['park', 'forest', 'nature_reserve']]], paint: { 'fill-color': '--map-zone-base-park', 'fill-opacity': 0.65 } });
    streetLayer(map, { id: 'street-water', type: 'fill', 'source-layer': 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '--map-water' } });
    streetLayer(map, { id: 'street-buildings', type: 'fill', 'source-layer': 'buildings', minzoom: 14, paint: { 'fill-color': '--map-road-casing', 'fill-opacity': 0.55 } });
    const width = ['interpolate', ['exponential', 1.5], ['zoom'], 8, 0.5, 14, 2, 18, 9];
    streetLayer(map, { id: 'roads-casing', type: 'line', 'source-layer': 'roads', paint: { 'line-color': '--map-road-casing', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 1.9, 14, 3.4, 18, 10.4] } });
    streetLayer(map, { id: 'street-roads', type: 'line', 'source-layer': 'roads', paint: { 'line-color': '--map-road', 'line-width': width } });
  }

  function labels(map, opts) {
    if (opts.labels === false) return;
    const text = { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12 };
    const paint = { 'text-color': '--c-text', 'text-halo-color': '--map-land', 'text-halo-width': 1.5 };
    streetLayer(map, { id: 'street-places', type: 'symbol', 'source-layer': 'places', layout: text, paint });
    if (opts.roadLabels !== false) streetLayer(map, { id: 'street-names', type: 'symbol', 'source-layer': 'roads', minzoom: 13, layout: { ...text, 'symbol-placement': 'line', 'text-size': 10 }, paint });
  }

  function basemap(map, opts) {
    const existing = new Set(map.getStyle().layers.map(({ id }) => id));
    streets(map);
    map.addSource('contours', source('contours'));
    layer(map, { id: 'contours', type: 'line', source: 'contours', minzoom: 11, paint: { 'line-color': '#a59980', 'line-width': 0.45, 'line-opacity': 0.35 } }, 'roads-casing');
    map.addSource('waterbodies', source('waterbodies'));
    HM.themed(map, { id: 'waterbodies', type: 'fill', source: 'waterbodies', paint: { 'fill-color': '--map-water' } }, 'roads-casing');
    map.addSource('streams', source('streams'));
    HM.themed(map, { id: 'streams', type: 'line', source: 'streams', minzoom: 11, paint: { 'line-color': '--map-water', 'line-width': 0.8 } }, 'roads-casing');
    map.addSource('roads', source('roads'));
    layer(map, { id: 'roads', type: 'line', source: 'roads', minzoom: 12, paint: { 'line-color': '#ffffff', 'line-width': 0.7 } });
    map.addSource('island-parcels', source('parcels'));
    HM.themed(map, { id: 'island-parcels-line', type: 'line', source: 'island-parcels', 'source-layer': 'layer', minzoom: 13.5, paint: { 'line-color': '--map-parcel', 'line-width': 0.5 } }, 'roads-casing');
    if (opts.zoningBase !== false) {
      map.addSource('zoning-base', source('zoning'));
      layer(map, { id: 'zoning-base', type: 'fill', source: 'zoning-base', paint: { 'fill-opacity': 0.22 } }, 'roads-casing');
    }
    labels(map, opts);
    map.basemapLayers = map.getStyle().layers.map(({ id }) => id).filter((id) => !existing.has(id));
  }

  window.HI = { bounds, register, source, layer, basemap };
})();
