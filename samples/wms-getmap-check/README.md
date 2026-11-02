# A WMS layer drawn from GetMap

Read a service's classic WMS `GetCapabilities`, request `GetMap` for its
first named layer, and draw the returned image over its bounding box in
MapLibre GL JS. The answer is checked as an image, not as a status code: it
must be a PNG of exactly the requested size. The inspected layer's metadata
and every request sit under the map. The default is Maui building footprints
around Kahului. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Get a map image out of WMS and see it in place |
| Level | Intermediate |
| Time | About 10 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`.

## What the code does

1. `GET /ogc/services/<service>/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`
   is parsed with `DOMParser`: every `Layer` with a `Name` is a candidate,
   with its title, abstract, CRS list, geographic bounds and `queryable` flag.
2. `GET …/wms?…&REQUEST=GetMap&LAYERS=<name>&CRS=EPSG:4326&BBOX=…&WIDTH=…&HEIGHT=…&FORMAT=image/png&TRANSPARENT=TRUE`
   fetches the image. WMS 1.3.0 orders an `EPSG:4326` `BBOX` as
   `minLat,minLon,maxLat,maxLon`. The response must be `image/png`, larger
   than 100 bytes, start with the PNG signature, and its IHDR width and height
   must equal the request. Anything else is a `FAIL`.
3. The verified PNG becomes a MapLibre image source whose corners are the
   bounding box, drawn as a raster layer; the map fits the box.

The `<pre>` under the map lists every request. There are no third-party
basemap tiles; the server's own Protomaps archive is used only if it answers,
and it is drawn beneath the WMS image.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server. |
| `service` | `maui-buildings` | Service whose WMS endpoint is read. |
| `layer` | (first named layer) | Layer name to request. |
| `bbox` | `-156.52,20.86,-156.46,20.90` | `minLon,minLat,maxLon,maxLat`, or `layer` for the advertised bounds. |
| `width`, `height` | `640`, `427` | Requested image size in pixels. |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `data-sample-status="pass"` with `data-layer-name`,
`data-layer-count`, `data-image-width`, `data-image-height`,
`data-image-bytes` and `data-sample-elapsed-ms`; on failure it shows
`FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec: against a composed server with the
committed fixture published as a WMS-enabled service it waits for
`GetCapabilities` to advertise the fixture layer, then checks that the page
names that layer, that the `GetMap` answer is a PNG of the requested
`317x241`, and that both requests were made; that a missing service reports
`FAIL`; and that the page's public-live default draws on the public
deployment within the time budget.
