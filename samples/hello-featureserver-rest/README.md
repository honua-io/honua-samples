# Your first FeatureServer query, drawn on a map

Discover a public service's first layer with plain `fetch()`, ask it for three
real features, and draw them in MapLibre GL JS. The endpoint detail (layer,
geometry type, fields, record limit) and every request sit under the map. No
account, API key, database, import or SDK is required. The default is three
Maui building footprints. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Make a first FeatureServer request and see the answer |
| Level | Beginner |
| Time | About 8 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`. Click a feature for its attributes.

## What the code does

1. `GET /rest/services/<service>/FeatureServer?f=json` lists the layers; the
   first one is the query target.
2. `GET /rest/services/<service>/FeatureServer/<id>?f=json` reads the layer's
   name, geometry type, fields and `maxRecordCount` for the detail panel.
3. `GET …/FeatureServer/<id>/query?where=…&resultRecordCount=3&f=geojson`
   returns three features with geometry. A feature without geometry is a
   `FAIL`, as is an empty answer.
4. The features become a GeoJSON source with fill, line and circle layers,
   the map fits them, and a click opens a popup with the attributes.

The `<pre>` under the map lists every request. There are no third-party
basemap tiles; the server's own Protomaps archive is used only if it answers.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server. |
| `service` | `maui-buildings` | An anonymous FeatureServer service; its first layer is queried. |
| `count` | `3` | `resultRecordCount` for the query. |
| `where` | `1=1` | Query filter. |
| `labelField` | `name` | Property used as the popup title; a dotted path reads a nested value. |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `data-sample-status="pass"` with `data-layer-id`,
`data-feature-count`, `data-rendered-features` and `data-sample-elapsed-ms`;
on failure it shows `FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec: against a composed server with a
FeatureServer seeded from the committed fixture it checks that the first
layer is discovered, that exactly the fixture's three features come back and
render at their interior points, and that a click opens the popup; that a
missing service reports the server's error; and that the page's public-live
default draws on the public deployment within the time budget.
