# Maui Workbench

The numeric view reads the published JavaScript SDK's Float32 `readWindow` result once and
uses those measurements for hover, click and arrow-key inspection. Colour is
a separate presentation of the same numbers. Unknown cells remain unknown.

Prepare the licensed NOAA input using [the preparation guide](../../scripts/state-local/depth-preparation.md).
Then run from this directory:

```sh
npm ci
HONUA_DEPTH_DIR=/absolute/path/to/artifacts/depth-prepared npm run build
```

Serve `dist/` alongside the shared `/state-local/assets/` site assets. Preparation
and deployment retain source, licence snapshots, checksum receipts and the
original-cell numeric oracle outside git. No NOAA data or deployment evidence
is committed. The tiny browser fixture is synthetic and does not represent
NOAA measurements. Build without a prepared input shows a recoverable loading
error; it does not substitute illustrative data.

The +3 ft scenario describes sea level above MHHW; measured depth is in metres
above ground. The source model vintage is unknown. NoData is not zero depth or
safety. This is separate from the State's 3.2 ft exposure-area polygons and is
not a forecast or evacuation instruction.

Run browser verification from the repository root after installing dependencies:

```sh
npx playwright test samples/maui-workbench/verify/depth.spec.mjs --project chromium
```

The local browser
oracle matches 32 original NOAA source cells in each of four light/dark desktop
and mobile views; inspection performs no additional raster downloads.

## Linked county analysis

Open `analysis.html` with both approved anonymous layers:

```text
analysis.html?baseUrl=https://demo.honua.io&parcelsService=SERVICE&parcelsLayer=ID&requestsService=SERVICE&requestsLayer=ID
```

Localhost origins also work for a local PostGIS-only candidate. Other origins and
credential-bearing URLs are rejected. No layers are inferred or substituted.
The parcel layer must provide `tmk_txt`, `gisacres`, and `taxacres`; the 311 layer
must provide `record_id`, `category`, `status`, `district`, `opened_at`, and the
exercise provenance fields `data_origin`, `is_demo`, `exercise_only`, and
`display_label`. Map queries and exports reject unlabelled exercise records;
CSV and GeoJSON retain these fields and their `DEMO DATA` labels.
Both must advertise a stable object ID, query pagination, exact extent/count
queries, and server filtering. The 311 chart also requires grouped statistics.

The view uses the published SDK source, filter registry, feature table, and chart.
Selecting a status filters the map, table, and exports; chart counts exclude that
chart's own filter. Switching catalogs clears filters and selection. The map is
bounded to 1,000 features, with an explicit partial-results message. The table
pages independently. CSV and GeoJSON share one bounded export snapshot until a
filter or catalog changes. Export refuses incomplete pagination, duplicate IDs,
count changes, more than 10,000 records, or more than 8 MiB. This detects count
changes during collection; the server does not promise a transactional snapshot.

The app-platform package currently requires explicit Terra Draw, its MapLibre
adapter, and PMTiles dependencies for production bundling. They are pinned here
so a clean install can resolve the published package's runtime imports.
The table uses a small pointer adapter to preserve selection when the published
component replaces a focused row during its synchronous render. Keyboard
navigation continues through the component's public table engine.

Run the focused checks with:

```sh
cd samples/maui-workbench && npm test
# From the repository root, after installing root dependencies:
npx playwright test samples/maui-workbench/verify/analysis.spec.mjs --project chromium
# Against a disposable localhost server running docker/compose.yml:
HONUA_BASE_URL=http://localhost:8080 HONUA_ADMIN_API_KEY=quickstart-admin-password \
  npx playwright test samples/maui-workbench/verify/server.spec.mjs --project chromium
```

The layout checks mock transport with small fictional records while running
the published SDK. The capability-keyed real-server check imports 205 fictional
requests and three synthetic parcel points through the admin API, publishes
anonymous layers, and checks pagination, chart filtering, table selection,
catalog switching, labeled exports, rejection of unlabelled requests, and polygon
intersection that excludes a point inside the polygon’s bounding box. These
points test the contract; they do not represent county parcel boundaries.
Neither check proves the shared deployment. The full Workbench (including agent
plan approval, scatter/time-series controls and map-click row reveal),
shared activation,
and published-site acceptance remain pending.

The analysis page can generate an anonymous link that restores its catalog,
field, status-chart, UTC date-range and WGS84 area filters using the published SDK's
`serializeInteractionQueryState` / `parseInteractionQueryState` helpers. State
lives in the URL fragment; endpoint bindings remain in the query string. Only
validated endpoint bindings are copied. Unsupported state fails before loading
records. Links fetch current data, preserve chart-filter ownership, and do not
grant access or snapshot records. Links also restore up to 100 selected numeric
object IDs and the map center, zoom, bearing and pitch. The camera controls the
view only; it does not change the geographic query filter. Embedded pages use
the same URL and responsive layout; host-controlled height and size-to-content
integration remain pending. Localhost links are useful for testing; a publicly usable link
still requires the approved shared deployment.

The linked map uses the published `<honua-measurement>` widget for geodesic
length and area in metres and square metres. Choose Distance or Area, click
vertices, then Finish (also available on touch screens). Escape or Cancel clears
the sketch; Off restores record selection. Measurements follow the clicked map
coordinates and do not calculate a parcel’s legal area. They are temporary and
are excluded from shared links and record exports. Drawing a query polygon and measuring are mutually exclusive.

The 311 opened-date filter includes the entire final UTC day using an exclusive
next-day bound. The geographic filter intersects an explicit WGS84 bounding box or a drawn polygon;
panning the map does not change it. Both use the same filter registry as the map,
table, status chart and exports. The expandable CQL2 preview uses the public SDK
query compiler; the connected layers receive equivalent GeoServices queries.
Choose Polygon in the published sketch control and close the ring by clicking its
first vertex. The filter accepts one simple WGS84 ring with 3–100 vertices;
holes, self-intersections and dateline crossings are rejected. It sends the
polygon itself to the server, retains an area overlay, and restores it from
shared links. Drawing replaces a bounding-box filter; Remove area filter clears
either. Point and line query filters are unavailable. Sketching never writes
features. The focused desktop/mobile checks run with:

```sh
npx playwright test samples/maui-workbench/verify/polygon.spec.mjs --project chromium
```

The selection panel calls the published SDK's read-only `summarizeSelection`
agent tool and cites the active layer, source URL and equivalent CQL2 filter.
It counts selected records and shows field frequencies for selected rows in the
loaded table window, explicitly reporting that window's coverage. Selection,
query or catalog changes clear the summary. This deterministic summary does
not supply natural-language analysis, histogram brushing or a comparison with
unselected records; those acceptance steps remain pending.
