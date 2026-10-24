# FeatureServer layer in MapLibre GL JS

Load a GeoServices FeatureServer layer as GeoJSON, draw it in MapLibre GL JS,
fit the map to it and open a popup on click. One HTML file, no build step,
no account and no API key.

| | |
| --- | --- |
| Goal | Build a map from a FeatureServer layer |
| Level | Beginner |
| Time | About 10 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`. The page reads
`maui-place-names/FeatureServer/6` (2,328 Maui place names) from
`https://demo.honua.io`, draws them and fits the map. Click a point for its
attributes. The `<pre>` under the map lists every request the page made.

## What the code does

1. `GET <layer>?f=json` reads the layer's name, geometry type and `maxRecordCount`.
2. `GET <layer>/query?where=…&outFields=*&outSR=4326&f=geojson` pages through
   the layer (`resultOffset`/`resultRecordCount`) until the server stops
   flagging `exceededTransferLimit`.
3. The FeatureCollection becomes a MapLibre `geojson` source with fill, line
   and circle layers filtered by `["geometry-type"]`, so points, lines and
   polygons all draw.
4. `fitBounds` uses the features' bounding box; a `click` handler opens a
   `maplibregl.Popup` with the feature's attributes.

There are no third-party basemap tiles. If the server publishes its own
Protomaps archive at `/api/v1/tiles/pmtiles/maui-basemap`, the page adds it
under the layer; otherwise it keeps a plain background and says so.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server to query. |
| `service` | `maui-place-names` | FeatureServer service name. |
| `layer` | `6` | Layer id within the service. |
| `where` | `1=1` | Query filter. |
| `labelField` | `name` | Attribute shown as the popup title; a dotted path reads a nested value. |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `document.body.dataset.sampleStatus` to `pass`, with
`data-feature-count`, `data-rendered-features` and `data-sample-elapsed-ms`.
On failure it shows `FAIL: <server error message>` (for example
`FAIL: Not Found` for a missing service) and sets `data-sample-status` to `fail`.

## Verification

`verify/` holds the Playwright spec the sample runner executes: against a
composed server with a layer seeded from the committed fixture (feature count,
every polygon rendered, popup title), and against the public-live defaults.
See [docs/browser-verification](../../docs/browser-verification/README.md).
