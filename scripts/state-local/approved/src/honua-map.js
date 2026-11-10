/* Honua demo map kit: decodes the embedded real Maui extracts and draws a vector basemap with MapLibre GL.
   No tile server, no glyph server: labels are HTML markers. window.HD holds the inlined datasets. */
(function () {
  const HD = (window.HD = window.HD || {});
  function decLine(a) {
    const out = []; let x = 0, y = 0;
    for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / 1e5, y / 1e5]); }
    return out;
  }
  function decode(c) {
    if (!c || c.type === "FeatureCollection") return c;
    const feats = c.p.map((vals, i) => {
      const props = {}; c.k.forEach((k, j) => (props[k] = vals[j]));
      const g = c.g[i]; let geometry;
      if (c.t === "poly") geometry = g.length === 1 ? { type: "Polygon", coordinates: g[0].map(decLine) } : { type: "MultiPolygon", coordinates: g.map((p) => p.map(decLine)) };
      else geometry = g.length === 1 ? { type: "LineString", coordinates: decLine(g[0]) } : { type: "MultiLineString", coordinates: g.map(decLine) };
      return { type: "Feature", id: props.id != null ? props.id : i, properties: props, geometry };
    });
    return { type: "FeatureCollection", features: feats };
  }
  const cache = {};
  function get(name) { if (!cache[name]) cache[name] = decode(HD[name]); return cache[name]; }
  function points(list, propsFn) {
    return { type: "FeatureCollection", features: list.map((r, i) => ({ type: "Feature", id: i, properties: propsFn ? propsFn(r, i) : r, geometry: { type: "Point", coordinates: r.c } })) };
  }
  const ZONE_GROUP = { "010": "res", "020": "res", "030": "res", "040": "res", "101": "res", "100": "res", "120": "res", "605": "res",
    "310": "bus", "320": "bus", "330": "bus", "370": "bus", "380": "bus", "390": "bus", "200": "bus", "215": "bus", "220": "bus",
    "410": "ind", "420": "ind", "430": "ind", "500": "ag", "900": "pub", "902": "pub", "905": "pub", "909": "pub", "929": "park", "720": "pd", "773": "pd" };
  const ZONE_COLOR = { res: "#f5e6a1", bus: "#f2b7ad", ind: "#d9c8ea", ag: "#d3e6bd", pub: "#bfd6ee", park: "#b8e0c6", pd: "#f1d1b0", other: "#e6e3da" };
  function zoneColorExpr() {
    const m = ["match", ["get", "code"]];
    const c = (g) => (window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue("--z-" + g).trim() : "") || ZONE_COLOR[g];
    Object.entries(ZONE_GROUP).forEach(([k, g]) => m.push(k, c(g)));
    m.push(c("other")); return m;
  }
  const VIEW = {
    kahului: [[-156.492, 20.872], [-156.455, 20.899]],
    wide: [[-156.53, 20.858], [-156.425, 20.912]],
    core: [[-156.5, 20.868], [-156.452, 20.9]],
  };
  const PLACES = [
    ["Kahului", -156.4705, 20.8835, "town"], ["Wailuku", -156.5045, 20.8895, "town"], ["Kahului Bay", -156.474, 20.9035, "water"],
    ["Kanahā Pond", -156.4555, 20.8915, "water"], ["Waiehu", -156.502, 20.9085, "town"], ["Puʻunēnē", -156.4555, 20.8635, "town"],
    ["Wailuku Heights", -156.522, 20.8775, "town"], ["Paukūkalo", -156.4955, 20.9015, "poi"],
  ];
  const ROADS = [["Kaʻahumanu Ave", -156.4835, 20.8893], ["Hāna Hwy", -156.4575, 20.8855], ["Honoapiʻilani Hwy", -156.508, 20.866], ["Kuihelani Hwy", -156.476, 20.866], ["Waiehu Beach Rd", -156.4925, 20.8995]];

  const maps = [];
  function cssVar(n, fb) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }
  function themeValue(value) {
    if (typeof value === "string" && value.startsWith("--")) return cssVar(value);
    if (Array.isArray(value)) return value.map(themeValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, themeValue(entry)]));
    return value;
  }
  function themed(map, layer, before) {
    const paint = layer.paint;
    map.addLayer({ ...layer, paint: themeValue(paint) }, before);
    map.on("honua:theme", () => Object.entries(paint).forEach(([key, value]) => map.setPaintProperty(layer.id, key, themeValue(value))));
  }
  function basePaint() {
    return {
      bg: { "background-color": cssVar("--map-water") },
      land: { "fill-color": cssVar("--map-land") },
      contours: { "line-color": cssVar("--map-contour") },
      "zoning-base": { "fill-color": ["match", ["get", "code"], ["320","330","310","370","380","390","200","215","220"], cssVar("--map-zone-base-bus"), ["410","420","430"], cssVar("--map-zone-base-ind"), ["500"], cssVar("--map-zone-base-ag"), ["929"], cssVar("--map-zone-base-park"), cssVar("--map-land")] },
      waterbodies: { "fill-color": cssVar("--map-waterbody") },
      streams: { "line-color": cssVar("--map-stream") },
      "roads-casing": { "line-color": ["match", ["get", "cls"], "hwy", cssVar("--map-hwy-casing"), cssVar("--map-road-casing")] },
      roads: { "line-color": ["match", ["get", "cls"], "hwy", cssVar("--map-hwy"), cssVar("--map-road")] },
      "parcels-line": { "line-color": cssVar("--map-parcel") },
      zoning: { "fill-color": zoneColorExpr() },
      flood: { "fill-color": ["match", ["get", "zone"], "VE", cssVar("--hz-vflood"), cssVar("--hz-flood")] },
      "flood-line": { "line-color": cssVar("--hz-flood") },
      tsunami: { "fill-color": cssVar("--hz-tsu") }, "tsunami-x": { "fill-color": cssVar("--hz-tsux") },
      "tsunami-line": { "line-color": ["match", ["get", "code"], 1, cssVar("--hz-tsu"), cssVar("--hz-tsux")] },
      slr: { "fill-color": cssVar("--hz-slr") },
      "parcels-fill": { "fill-color": ["case", ["boolean", ["feature-state", "sel"], false], cssVar("--map-select"), "#000000"] },
      "parcels-sel": { "line-color": cssVar("--map-select-line") },
    };
  }
  function restyle(map) {
    const P = basePaint();
    Object.entries(P).forEach(([id, paint]) => { if (map.getLayer(id)) Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v)); });
    map.fire("honua:theme");
  }
  function theme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("honua-theme", t); } catch (e) { /* storage unavailable: mode lasts for this page view */ }
    maps.forEach((m) => { try { if (m.isStyleLoaded()) restyle(m); else m.once("load", () => restyle(m)); } catch (e) {} });
    document.querySelectorAll(".theme-toggle").forEach((b) => { b.setAttribute("aria-pressed", t === "dark"); b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode"); b.title = b.getAttribute("aria-label"); });
    document.dispatchEvent(new CustomEvent("honua:theme", { detail: { theme: t } }));
  }
  function mountToggle() {
    if (document.querySelector(".theme-toggle")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "theme-toggle";
    b.innerHTML = '<svg class="ico i-moon" aria-hidden="true"><use href="#i-moon"/></svg><svg class="ico i-sun" aria-hidden="true"><use href="#i-sun"/></svg>';
    b.addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark"));
    const bar = document.querySelector("[data-theme-slot]") || document.querySelector(".appbar, .topbar-row, header");
    if (bar) { const av = bar.querySelector("[data-theme-before], .avatar"); av ? bar.insertBefore(b, av) : bar.appendChild(b); } else { b.classList.add("floating"); document.body.appendChild(b); }
    setTheme(theme());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountToggle); else mountToggle();
  function create(el, opts) {
    opts = opts || {};
    if (!window.maplibregl) { el.innerHTML = '<p style="padding:16px">Map library could not load. Connect to the internet to view the interactive map.</p>'; return null; }
    const map = new maplibregl.Map({
      container: el, attributionControl: false, maxBounds: opts.maxBounds || [[-156.545, 20.849], [-156.41, 20.921]], dragRotate: false, pitchWithRotate: false, maxZoom: 19, minZoom: 10,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--map-water", "#c9dfe8") } }] },
      bounds: opts.bounds || VIEW[opts.view || "core"], fitBoundsOptions: { padding: opts.padding || 20 },
      interactive: opts.interactive !== false, cooperativeGestures: !!opts.cooperative,
    });
    maps.push(map);
    // Containers that size after first paint (grid rows, fonts, embedded frames) leave the canvas short; follow the container.
    const fitBounds = opts.bounds || VIEW[opts.view || "core"];
    new ResizeObserver(() => { map.resize(); if (opts.interactive === false) map.fitBounds(fitBounds, { padding: opts.padding || 0, animate: false }); }).observe(el);
    if (opts.nav !== false && opts.interactive !== false) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), opts.navPos || "top-right");
    const a = document.createElement("div"); a.className = "mapattr";
    a.textContent = opts.attr || "Data: Hawaii Statewide GIS Program, County of Maui · served by Honua";
    el.appendChild(a);
    map.on("load", () => {
      basemap(map, opts); restyle(map);
      if (opts.onload) opts.onload(map);
    });
    return map;
  }
  function add(map, id, data) { if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: typeof data === "string" ? get(data) : data, promoteId: "id" }); }
  function basemap(map, opts) {
    add(map, "land", HD.land);
    map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": "#f4f2ec" } });
    if (HD.contours) { add(map, "contours", "contours"); map.addLayer({ id: "contours", type: "line", source: "contours", paint: { "line-color": "#c9bfa6", "line-width": ["case", ["==", ["%", ["get", "ft"], 500], 0], 0.9, 0.45], "line-opacity": 0.75 } }); }
    if (HD.zoning && opts.zoningBase !== false) {
      add(map, "zoning-base", "zoning");
      map.addLayer({ id: "zoning-base", type: "fill", source: "zoning-base", paint: { "fill-color": ["match", ["get", "code"], ["320","330","310","370","380","390","200","215","220"], "#efe8e0", ["410","420","430"], "#ebe7ef", ["500"], "#eaf0df", ["929"], "#dcefe1", "#f4f2ec"], "fill-opacity": 0.9 } });
    }
    if (HD.waterbodies) { add(map, "waterbodies", HD.waterbodies); map.addLayer({ id: "waterbodies", type: "fill", source: "waterbodies", paint: { "fill-color": "#bcd8e4" } }); }
    if (HD.streams) { add(map, "streams", "streams"); map.addLayer({ id: "streams", type: "line", source: "streams", paint: { "line-color": "#8fbfd4", "line-width": 1 } }); }
    if (HD.roads) {
      add(map, "roads", "roads");
      const w = (l, m, h) => ["interpolate", ["exponential", 1.6], ["zoom"], 12, ["match", ["get", "cls"], "hwy", h * 0.5, "major", m * 0.5, l * 0.4], 17, ["match", ["get", "cls"], "hwy", h * 4, "major", m * 4, l * 4]];
      map.addLayer({ id: "roads-casing", type: "line", source: "roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "cls"], "hwy", "#d2a54c", "#d6cfbf"], "line-width": w(2.2, 3.4, 4.4) } });
      map.addLayer({ id: "roads", type: "line", source: "roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "cls"], "hwy", "#fbe2a0", "#ffffff"], "line-width": w(1.4, 2.4, 3.2) } });
    }
    if (opts.labels !== false) {
      PLACES.forEach(([t, x, y, c]) => label(map, [x, y], t, c));
      if (opts.roadLabels !== false) ROADS.forEach(([t, x, y]) => label(map, [x, y], t, "road"));
    }
  }
  function label(map, ll, text, cls) {
    const d = document.createElement("div"); d.className = "maplabel " + (cls || ""); d.textContent = text;
    return new maplibregl.Marker({ element: d, anchor: "center" }).setLngLat(ll).addTo(map);
  }
  function overlays(map, which, before) {
    which = which || [];
    if (which.includes("zoning")) { add(map, "zoning", "zoning"); map.addLayer({ id: "zoning", type: "fill", source: "zoning", paint: { "fill-color": zoneColorExpr(), "fill-opacity": 0.5 } }, before); map.addLayer({ id: "zoning-line", type: "line", source: "zoning", paint: { "line-color": "#a49c86", "line-width": 0.6 } }, before); }
    if (which.includes("slr")) { add(map, "slr", "slr32"); map.addLayer({ id: "slr", type: "fill", source: "slr", paint: { "fill-color": "#0b7285", "fill-opacity": 0.28 } }, before); }
    if (which.includes("flood")) {
      add(map, "flood", "dfirm");
      map.addLayer({ id: "flood", type: "fill", source: "flood", filter: ["in", ["get", "zone"], ["literal", ["AE", "A", "AO", "AH", "VE"]]], paint: { "fill-color": ["match", ["get", "zone"], "VE", "#1b4f8f", "#2f74c0"], "fill-opacity": 0.26 } }, before);
      map.addLayer({ id: "flood-line", type: "line", source: "flood", filter: ["in", ["get", "zone"], ["literal", ["AE", "A", "AO", "AH", "VE"]]], paint: { "line-color": "#1d5fa8", "line-width": 1.3, "line-opacity": 0.85 } }, before);
    }
    if (which.includes("tsunami")) {
      add(map, "tsunami", HD.tsunami);
      map.addLayer({ id: "tsunami-x", type: "fill", source: "tsunami", filter: ["==", ["get", "code"], 2], paint: { "fill-color": "#f08c00", "fill-opacity": 0.14 } }, before);
      map.addLayer({ id: "tsunami", type: "fill", source: "tsunami", filter: ["==", ["get", "code"], 1], paint: { "fill-color": "#d9480f", "fill-opacity": 0.24 } }, before);
      map.addLayer({ id: "tsunami-line", type: "line", source: "tsunami", filter: ["in", ["get", "code"], ["literal", [1, 2]]], paint: { "line-color": ["match", ["get", "code"], 1, "#c2410c", "#e8890c"], "line-width": 1.2, "line-dasharray": [3, 2] } }, before);
    }
    if (which.includes("council")) { add(map, "council", HD.council); map.addLayer({ id: "council", type: "line", source: "council", paint: { "line-color": "#5e6a65", "line-width": 1.4, "line-dasharray": [4, 3] } }, before); }
    if (which.includes("parcels")) {
      add(map, "parcels", "parcels");
      map.addLayer({ id: "parcels-fill", type: "fill", source: "parcels", paint: { "fill-color": ["case", ["boolean", ["feature-state", "sel"], false], "#0f766e", "#000000"], "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.45, ["boolean", ["feature-state", "hover"], false], 0.06, 0] } }, before);
      map.addLayer({ id: "parcels-line", type: "line", source: "parcels", minzoom: 13.5, paint: { "line-color": "#8f8a7c", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 17, 1] } }, before);
      map.addLayer({ id: "parcels-sel", type: "line", source: "parcels", filter: ["==", ["get", "id"], -1], paint: { "line-color": "#0b4f4a", "line-width": 3.5 } });
    }
  }
  function toggle(map, ids, on) { ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none")); }
  function bindToggles(map, root) {
    (root || document).querySelectorAll("[data-layers]").forEach((cb) => {
      const ids = cb.dataset.layers.split(",");
      toggle(map, ids, cb.checked);
      cb.addEventListener("change", () => toggle(map, ids, cb.checked));
    });
  }
  function bbox(geom) {
    let a = [180, 90, -180, -90];
    (function walk(c) { if (typeof c[0] === "number") { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); })(geom.coordinates);
    return [[a[0], a[1]], [a[2], a[3]]];
  }
  function tmk(t9) { const s = String(t9).padStart(9, "0"); return `(${s[0]}) ${s[1]}-${s[2]}-${s.slice(3, 6)}:${s.slice(6)}`; }
  function money(n) { return n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"); }
  function icon(name) { return `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  window.HM = { themed, cssVar, setTheme, theme, restyle, maps, decode, get, points, create, add, overlays, toggle, bindToggles, label, bbox, tmk, money, icon, VIEW, ZONE_GROUP, ZONE_COLOR };

  /* Tabs: [role=tablist] buttons with aria-controls */
  document.addEventListener("click", (e) => {
    const t = e.target.closest('[role="tab"]'); if (!t) return;
    const list = t.closest('[role="tablist"]');
    list.querySelectorAll('[role="tab"]').forEach((b) => { const on = b === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; const p = document.getElementById(b.getAttribute("aria-controls")); if (p) p.hidden = !on; });
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest && e.target.closest('[role="tab"]'); if (!t || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = [...t.closest('[role="tablist"]').querySelectorAll('[role="tab"]')]; const i = tabs.indexOf(t);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  /* Segmented buttons */
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".seg button"); if (!b) return;
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
})();
