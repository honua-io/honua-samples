# Stock esri-leaflet FeatureLayer on Honua

Draw a filtered Honua FeatureServer layer with unmodified
[Leaflet](https://leafletjs.com/) and
[esri-leaflet](https://developers.arcgis.com/esri-leaflet/), with popups. The
page has no Honua-specific code: point `url` at an ArcGIS Server FeatureServer
layer and it behaves the same. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Use an existing Esri web client against Honua |
| Level | Beginner |
| Time | About 8 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `leaflet@1.9.4`, `esri-leaflet@3.0.19` (jsDelivr, pinned with SRI hashes) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`. The page draws the Maui inspection points on
`https://demo.honua.io/rest/services/maui-inspections/FeatureServer/12`
whose `status <> 'ok'`, coloured by status. Click a point for its attributes.

## What the code does

1. `L.esri.query({ url }).where(where).bounds(…)` asks the layer for the
   extent of the filtered features (`returnExtentOnly=true`), and the map fits it.
2. `L.esri.featureLayer({ url, where, pointToLayer, style })` requests the
   features for the visible grid cells and draws points as circle markers.
3. `bindPopup` renders the clicked feature's attributes.

The `<pre>` under the map lists every request esri-leaflet made
(`requeststart` events) plus one range probe for the basemap. The basemap is
the server's own Protomaps PMTiles archive
(`/api/v1/tiles/pmtiles/maui-basemap` on the layer's origin), drawn by
[protomaps-leaflet](https://github.com/protomaps/protomaps-leaflet) beneath the
feature layer only when the probe answers with a PMTiles header; otherwise the
layer draws over a plain background. `?basemap=none` turns it off. The
esri-leaflet code is the same either way.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `url` | `https://demo.honua.io/rest/services/maui-inspections/FeatureServer/12` | FeatureServer layer URL. |
| `where` | `status <> 'ok'` | Query filter. |
| `basemap` | (on) | `none` skips the PMTiles basemap probe and draws over a plain background. |

On success the page sets `data-sample-status="pass"` with
`data-feature-count`, `data-rendered-features` (SVG paths drawn) and
`data-sample-elapsed-ms`; on failure (for example an invalid `where`) it
shows `FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec: against a composed server with a layer
seeded from the committed fixture (every fixture polygon drawn, popup shows
the fixture name, an invalid `where` fails), and against the public-live
default. See [docs/browser-verification](../../docs/browser-verification/README.md).
