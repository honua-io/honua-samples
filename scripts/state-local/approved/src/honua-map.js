/* Honua demo map kit: shared interactions and the bounded Maui story records.
   The island adapter supplies native archives and the street basemap. */
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
    const m = ["match", ["to-string", ["coalesce", ["get", "code"], ["get", "zone_code"]]]];
    const c = (g) => (window.getComputedStyle ? getComputedStyle(document.documentElement).getPropertyValue("--z-" + g).trim() : "") || ZONE_COLOR[g];
    Object.entries(ZONE_GROUP).forEach(([k, g]) => m.push(k, c(g)));
    m.push(c("other")); return m;
  }
  const VIEW = {
    kahului: [[-156.492, 20.872], [-156.455, 20.899]],
    wide: [[-156.53, 20.858], [-156.425, 20.912]],
    core: [[-156.5, 20.868], [-156.452, 20.9]],
  };
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
      "zoning-base": { "fill-color": ["match", ["to-string", ["coalesce", ["get", "code"], ["get", "zone_code"]]], ["320","330","310","370","380","390","200","215","220"], cssVar("--map-zone-base-bus"), ["410","420","430"], cssVar("--map-zone-base-ind"), ["500"], cssVar("--map-zone-base-ag"), ["929"], cssVar("--map-zone-base-park"), cssVar("--map-land")] },
      waterbodies: { "fill-color": cssVar("--map-waterbody") },
      streams: { "line-color": cssVar("--map-stream") },
      "roads-casing": { "line-color": ["match", ["get", "cls"], "hwy", cssVar("--map-hwy-casing"), cssVar("--map-road-casing")] },
      roads: { "line-color": ["match", ["get", "cls"], "hwy", cssVar("--map-hwy"), cssVar("--map-road")] },
      "parcels-line": { "line-color": cssVar("--map-parcel") },
      zoning: { "fill-color": zoneColorExpr() },
      flood: { "fill-color": ["match", ["coalesce", ["get", "zone"], ["get", "fld_zone"]], "VE", cssVar("--hz-vflood"), cssVar("--hz-flood")] },
      "flood-line": { "line-color": cssVar("--hz-flood") },
      tsunami: { "fill-color": cssVar("--hz-tsu") }, "tsunami-x": { "fill-color": cssVar("--hz-tsux") },
      "tsunami-line": { "line-color": ["match", ["coalesce", ["get", "code"], ["get", "zone_code"]], 1, cssVar("--hz-tsu"), cssVar("--hz-tsux")] },
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
    if (window.HI) HI.register();
    const map = new maplibregl.Map({
      container: el, attributionControl: false, maxBounds: opts.maxBounds || HI.bounds, dragRotate: false, pitchWithRotate: false, maxZoom: 19, minZoom: 8, hash: opts.interactive !== false && !opts.cooperative,
      style: { version: 8, glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf", sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--map-water", "#c9dfe8") } }] },
      bounds: opts.bounds || VIEW[opts.view || "core"], fitBoundsOptions: { padding: opts.padding || 20 },
      interactive: opts.interactive !== false, cooperativeGestures: !!opts.cooperative,
    });
    maps.push(map);
    // Containers that size after first paint (grid rows, fonts, embedded frames) leave the canvas short; follow the container.
    const fitBounds = opts.bounds || VIEW[opts.view || "core"];
    new ResizeObserver(() => { map.resize(); if (opts.interactive === false) map.fitBounds(fitBounds, { padding: opts.padding || 0, animate: false }); }).observe(el);
    if (opts.nav !== false && opts.interactive !== false) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), opts.navPos || "top-right");
    const a = document.createElement("div"); a.className = "mapattr";
    a.innerHTML = 'Data: Hawaii Statewide GIS · Honua tiles · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · Protomaps';
    el.appendChild(a);
    map.on("load", () => {
      basemap(map, opts); restyle(map);
      if (opts.onload) opts.onload(map);
    });
    return map;
  }
  function add(map, id, data) {
    if (map.getSource(id)) return;
    const name = typeof data === "string" ? data : Object.keys(HD).find((key) => HD[key] === data);
    const island = name && name !== "parcels" ? HI.source(name) : null;
    map.addSource(id, island || { type: "geojson", data: typeof data === "string" ? get(data) : data, promoteId: "id" });
  }
  function basemap(map, opts) { HI.basemap(map, opts); }
  function label(map, ll, text, cls) {
    const d = document.createElement("div"); d.className = "maplabel " + (cls || ""); d.textContent = text;
    return new maplibregl.Marker({ element: d, anchor: "center" }).setLngLat(ll).addTo(map);
  }
  function overlays(map, which, before) {
    which = which || [];
    if (which.includes("zoning")) { add(map, "zoning", "zoning"); HI.layer(map, { id: "zoning", type: "fill", source: "zoning", paint: { "fill-color": zoneColorExpr(), "fill-opacity": 0.5 } }, before); HI.layer(map, { id: "zoning-line", type: "line", source: "zoning", paint: { "line-color": "#a49c86", "line-width": 0.6 } }, before); }
    if (which.includes("slr")) { add(map, "slr", "slr32"); HI.layer(map, { id: "slr", type: "fill", source: "slr", paint: { "fill-color": "#0b7285", "fill-opacity": 0.28 } }, before); }
    if (which.includes("flood")) {
      add(map, "flood", "dfirm");
      HI.layer(map, { id: "flood", type: "fill", source: "flood", filter: ["in", ["coalesce", ["get", "zone"], ["get", "fld_zone"]], ["literal", ["AE", "A", "AO", "AH", "VE"]]], paint: { "fill-color": ["match", ["coalesce", ["get", "zone"], ["get", "fld_zone"]], "VE", "#1b4f8f", "#2f74c0"], "fill-opacity": 0.26 } }, before);
      HI.layer(map, { id: "flood-line", type: "line", source: "flood", filter: ["in", ["coalesce", ["get", "zone"], ["get", "fld_zone"]], ["literal", ["AE", "A", "AO", "AH", "VE"]]], paint: { "line-color": "#1d5fa8", "line-width": 1.3, "line-opacity": 0.85 } }, before);
    }
    if (which.includes("tsunami")) {
      add(map, "tsunami", "tsunami");
      HI.layer(map, { id: "tsunami-x", type: "fill", source: "tsunami", filter: ["==", ["coalesce", ["get", "code"], ["get", "zone_code"]], 2], paint: { "fill-color": "#f08c00", "fill-opacity": 0.14 } }, before);
      HI.layer(map, { id: "tsunami", type: "fill", source: "tsunami", filter: ["==", ["coalesce", ["get", "code"], ["get", "zone_code"]], 1], paint: { "fill-color": "#d9480f", "fill-opacity": 0.24 } }, before);
      HI.layer(map, { id: "tsunami-line", type: "line", source: "tsunami", filter: ["in", ["coalesce", ["get", "code"], ["get", "zone_code"]], ["literal", [1, 2]]], paint: { "line-color": ["match", ["coalesce", ["get", "code"], ["get", "zone_code"]], 1, "#c2410c", "#e8890c"], "line-width": 1.2, "line-dasharray": [3, 2] } }, before);
    }
    if (which.includes("council")) { add(map, "council", HD.council); HI.layer(map, { id: "council", type: "line", source: "council", paint: { "line-color": "#5e6a65", "line-width": 1.4, "line-dasharray": [4, 3] } }, before); }
    if (which.includes("parcels")) {
      add(map, "parcels", "parcels");
      HI.layer(map, { id: "parcels-fill", type: "fill", source: "parcels", paint: { "fill-color": ["case", ["boolean", ["feature-state", "sel"], false], "#0f766e", "#000000"], "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.45, ["boolean", ["feature-state", "hover"], false], 0.06, 0] } }, before);
      HI.layer(map, { id: "parcels-line", type: "line", source: "parcels", minzoom: 13.5, paint: { "line-color": "#8f8a7c", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 17, 1] } }, before);
      HI.layer(map, { id: "parcels-sel", type: "line", source: "parcels", filter: ["==", ["get", "id"], -1], paint: { "line-color": "#0b4f4a", "line-width": 3.5 } });
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
  window.HM = { zoneColorExpr, themed, cssVar, setTheme, theme, restyle, maps, decode, get, points, create, add, overlays, toggle, bindToggles, label, bbox, tmk, money, icon, VIEW, ZONE_GROUP, ZONE_COLOR };

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
