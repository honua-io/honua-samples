# Category style and legend from OGC API Features

Read features from OGC API Features, colour them by a category field with a
MapLibre `match` expression, and build the HTML legend and the popup from the
same values. The default is Maui zoning districts around Kahului, coloured by
`zone_dist`. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Style a map by category with a legend |
| Level | Intermediate |
| Time | About 15 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`. Click a polygon for its attributes.

## What the code does

1. `GET /ogc/features/collections/<id>/queryables?f=json` lists the fields a
   client can filter on; the status line says whether the style field is one.
2. `GET /ogc/features/collections/<id>/items?limit=…&bbox=…&f=json` returns a
   GeoJSON FeatureCollection.
3. The page counts the distinct values of the field. The eight most common
   get a colour; the rest share "Other". Each feature carries its class in
   `category_class`, so the style is one expression:
   `["match", ["get", "category_class"], value1, colour1, …, otherColour]`.
4. The legend lists each class with its colour and feature count; a click
   handler opens a popup with the feature's attributes.

The `<pre>` under the map lists every request. There are no third-party
basemap tiles; the server's own Protomaps archive is used only if it answers.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server. |
| `collection` | `maui-zoning` | Collection id. |
| `field` | `zone_dist` | Category field; a dotted path reads a nested value. |
| `bbox` | `-156.52,20.86,-156.44,20.91` | `minLon,minLat,maxLon,maxLat`, or `none`. |
| `limit` | `1000` | Items per request. |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `data-sample-status="pass"` with
`data-feature-count`, `data-category-count`, `data-rendered-features` and
`data-sample-elapsed-ms`; on failure it shows `FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec: against a composed server with a
collection seeded from the committed fixture (legend labels and counts, one
colour per category, each polygon rendered under its category, popup title),
and against the public-live default. See
[docs/browser-verification](../../docs/browser-verification/README.md).
