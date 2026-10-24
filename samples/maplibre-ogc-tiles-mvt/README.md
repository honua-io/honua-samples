# OGC API Tiles vector tiles in MapLibre GL JS

Read a collection's OGC API Tiles tileset metadata, turn its templated tile
link into a MapLibre vector source, and draw the tiles. The default is
`maui-buildings` (about 42,000 Overture building footprints), extruded by
`render_height`. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Build a map from OGC API vector tiles |
| Level | Intermediate |
| Time | About 10 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:8123/" -->
```bash
npx serve -l 8123 src
```

Open `http://localhost:8123`. Port 8123 matters for the public demo: the
cached tile routes on `https://demo.honua.io` send CORS headers only to
`https://honua.io`, `https://www.honua.io` and `http://localhost:8123`.
Against your own Honua server, any origin its `Cors:AllowedOrigins` allows works.

## What the code does

1. `GET /ogc/tiles/collections/<id>/tiles/WebMercatorQuad?f=json` reads the
   tileset: its `dataType`, the zoom levels in `tileMatrixSetLimits`, and the
   `item` link with type `application/vnd.mapbox-vector-tile`.
2. The link's `{tileMatrix}/{tileRow}/{tileCol}` template becomes MapLibre's
   `{z}/{y}/{x}`, and requests go to `baseUrl` even when the server advertises
   another host name.
3. A `vector` source with that template and a `fill-extrusion` layer on
   source-layer `layer` draw the buildings; height and colour come from
   `render_height`.
4. With `view=extent` the page fits the collection's extent from
   `/ogc/features/collections/<id>`.

The `<pre>` under the map lists the metadata request, the tile template and
every tile the map requested. There are no third-party basemap tiles; the
server's own Protomaps archive is used only if it answers.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server. |
| `collection` | `maui-buildings` | Collection id. |
| `sourceLayer` | `layer` | Vector tile layer name. |
| `view` | `-156.4729,20.8893,15.5` | `lng,lat,zoom`, or `extent` to fit the collection. |
| `extrude` | `true` | `false` draws flat fills. |
| `heightField` | `render_height` | Attribute used for extrusion height (4 m when missing). |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `data-sample-status="pass"` with
`data-rendered-features`, `data-tile-requests` and `data-sample-elapsed-ms`;
on failure it shows `FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec: against a composed server with a
collection seeded from the committed fixture (OGC API Tiles enabled, every
fixture polygon must render from the tiles), and against the public-live
default, served from `http://localhost:8123` for the reason above. See
[docs/browser-verification](../../docs/browser-verification/README.md).
