# County parcel viewer

Start with the [native application path](../../docs/native-applications.md):
authenticated gRPC for live queries and approved edits, browser gRPC-Web setup,
and versioned PMTiles/GeoParquet/COG range reads through the CDN for public or
read-heavy data. Private files require authorized signed URLs and regeneration
when data changes. The guide records this app's remaining native migration gaps.
Existing REST SDK calls and OGC feeds below are **compatibility** examples; they
do not establish native transport readiness.

A parcel viewer a small county can run on Honua instead of a Tax Parcel Viewer template. Find a parcel by
its number (TMK on Maui), by street address or by clicking it on the map, and see:

- the zoning districts that cover it, each with its share of the parcel;
- the FEMA flood zones it touches, with FEMA's plain meaning and share, worded so the page never claims a
  flood determination;
- its assessor record link, acreage, and the fields the county data does not carry (land use, owner);
- a link to that parcel you can copy and share;
- a linked, paged parcel table and attribute inspection panel, with exact TMK filtering and bounded exports.

It is a Vite app built on the published Honua JavaScript SDK (`@honua/sdk-js@0.4.0`) and
application platform (`@honua/app-platform@0.4.0`), both pinned in `package-lock.json`, running on public Maui County demo data. It is not affiliated with the County of Maui.

| | |
| --- | --- |
| Goal | Build a county map app on Honua |
| Level | Intermediate |
| Time | About 20 minutes |
| Prerequisites | Node.js 22.12 or later, a modern web browser, internet access |
| Libraries | `@honua/sdk-js` and `@honua/app-platform` 0.4.0, `maplibre-gl` 6.4.1, `pmtiles` 4.5.0, `@fontsource` Public Sans 5.3.0 and Source Serif 4 5.3.1 |

## Data sources and freshness

The expandable source disclosure below the search field identifies the active mode and links to its
configured sources. The default combines PMTiles parcel outlines with separate live service queries
for selected geometry, details and planning results; these can represent different versions. With
`parcelTilesUrl=none`, parcels use service queries without archived outlines. The state-local gallery
reads bundled GeoJSON instead, and fixture mode clearly identifies invented records and local sources.

No verified capture or update timestamps are currently configured, so the disclosure says dates are
unavailable. Neither a successful live request nor a date supplied in the page URL establishes data
freshness. This demo is not a current land-use or flood determination.

## Run

```bash
npm ci
npm run dev
```

Open the URL Vite prints. The first load shows an example parcel (TMK 2-3-4-008:053, downtown Wailuku). `npm run build` typechecks
and writes the static app to `dist/`; any static file server can host it, at any path (`base: "./"`).

### Run with local synthetic data

After `npm ci`, the fixture runs without a live Honua server or external network access:

```bash
npm run dev:fixture
```

Try TMKs `234008053`, `234008054` and `234008055`, click a parcel, select a table row, filter the table,
and download the selected GeoJSON or filtered CSV. The map, overlap results, SDK table, inspection and
bounded export use the same application paths as the live mode. All geometry, acreage, zoning and flood
values are synthetic; the page labels them accordingly. They are not county records or land-use guidance.
Address search, basemap tiles, buildings and additional planning layers are unavailable in this mode.
Data-source URL overrides are ignored, so a copied live URL cannot send fixture queries to a remote server.

To check the production build locally:

```bash
npm run test:fixture
npm run build:fixture
npm run preview:fixture
```

`fixture/service.ts` supplies three parcels and a small, explicit GeoServices query subset: metadata,
TMK/ID equality, point/polygon intersects, field projection, ordering, paging, counts and IDs. Unsupported
queries return errors. This is a development fixture, not a Honua server implementation or protocol
qualification. `dist-fixture/` requires the Vite fixture preview middleware; it is not a standalone static
hosting artifact. The normal build still writes the live application to `dist/`.

## What the code does

| File | Job |
| --- | --- |
| `src/data.ts` | `connect()` discovers each FeatureServer layer with a client whose `fetchFn` is the request logger. `QueryBuilder` then runs the TMK lookup (`where=tmk_txt='<9 digits>'`), the point identify for a map click or a geocoded address, and the zoning and flood candidate queries, sent as `POST` with the parcel polygon as `geometry`. |
| `src/overlap.ts` | Converts the Esri JSON answers to GeoJSON, groups polygons by `zone_code` / `fld_zone`, merges each group with `union`, clips it to the parcel with `intersect` and measures it with `area` (geodesic m²), all from `@honua/sdk-js/geometry`. |
| `src/map.ts` | MapLibre draws the server's Protomaps basemap and the parcel outlines from the static PMTiles archive `maui-parcels-static`, mounted with `registerPmtilesSource` from `@honua/sdk-js/pmtiles` and the `pmtiles` protocol. The selected parcel is a filter on those tiles. |
| `src/buildings.ts` | The 2D/3D control uses the published SDK's `scene-workspace` extrusion adapter and Overture building PMTiles on the same server. |
| `src/tmk.ts` | TMK input: spaces, `-`, `:` and `.` are stripped and only `^[0-9]{9}$` is accepted, so `2-1-5-010:077` searches `215010077`. Anything else shows "Not a valid TMK" and sends no request. |
| `src/parcel-browser.ts` | Public SDK application context, feature table and inspection components. Loads 25 rows per page, exports at most 100 filtered CSV rows or one selected parcel re-queried by stable ID as GeoJSON. Export authorization is limited to the public demo layer (or the local fixture in fixture mode); custom sources must supply their own policy. |
| `src/main.ts` | The results panel, its loading, empty, error and retry states, history (`pushState` per lookup, Back re-renders), and the share links. |
| `src/request-log.ts` | "Technical details (requests this page made)" lists every FeatureServer and GeocodeServer request and every PMTiles byte-range read. |

The rules the panel applies:

- **Zoning** counts a district when it covers at least 1% of the parcel and at least 10 m², so digitizing slivers
  along lot lines drop out. The main district is the largest. With no district: "Not in the county zoning layer".
- **Flood** is a safety field, so any overlap counts. A share under 1% reads "touches the parcel edge (<1%)". With no
  flood polygon the page says it found none in the county's copy of the FEMA map, and that this is not a flood
  determination.
- A failed zoning or flood query says the check failed and offers a retry. It never shows the no-match text.
- Percentages are whole numbers; "<1%" appears only when the share really is under 1%.

In live mode, parcels are drawn only from the PMTiles archive. FeatureServer answers are used for lookups,
identify and overlap math. The local fixture draws its synthetic polygons from a local GeoJSON endpoint.

The planning-layer controls show zoning and high-risk flood candidates for the selected parcel, using the same queries as the results panel. They do not download the full datasets.

The viewer passes explicit attribute fields for inspection and uses a public `table.select()` pointer handler, because in SDK 0.3.2 focusing a row could replace it before its click fired. Keyboard selection remains native. These measures are kept unchanged on `@honua/app-platform` 0.4.0 and have not been retested there; remove them once a published release is shown to fix both.

### Address search

Address search uses the server's GeocodeServer (`World` locator). The page credits OpenStreetMap, so it first
reads the locator's provider and only sends an address when the provider is Nominatim (OpenStreetMap). Any other
provider gets "Address search is unavailable right now. Search by TMK instead." A house or building match is
looked up as a parcel. A street centre line (OpenStreetMap `highway`, with no house number) is labelled as that
street and asks for a TMK or a map click. It does not report "No parcel at that address".

## Try it on your own layers

Every default is on one Honua server. URL parameters point the same build somewhere else:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `tmk` | (example parcel) | The selected parcel, 9 digits. |
| `baseUrl` | `https://demo.honua.io` | Honua server for every default below and for the geocoder. |
| `parcelsUrl` | `<baseUrl>/rest/services/maui-parcels/FeatureServer/1` | Parcel layer with `tmk_txt`, `gisacres`, `taxacres`, `qpub_link`. |
| `zoningUrl` | `<baseUrl>/rest/services/maui-zoning/FeatureServer/2` | Zoning layer with `zone_code` and `zone_dist`. |
| `floodUrl` | `<baseUrl>/rest/services/maui-flood-hazard/FeatureServer/4` | Flood layer with `fld_zone` (A, AE, AH, AO, D, V, VE, X). |
| `parcelTilesUrl` | `<baseUrl>/api/v1/tiles/pmtiles/maui-parcels-static` | PMTiles archive of parcel outlines (source layer `layer`, attribute `tmk_txt`). `none` turns outlines off; clicking still identifies. |
| `buildingsUrl` | `<baseUrl>/api/v1/tiles/pmtiles/maui-buildings-static` | Overture building footprints for optional 3D context. Source layer `layer`, height in metres in `render_height`. `none` removes the 3D control. |
| `basemap` | (on) | `none` skips the server's `maui-basemap` PMTiles basemap. |

Share links keep these parameters. There is no field mapping: your layers need the field names above.

The existing demo building archive contains 42,674 Overture footprints from release `2026-05-20.0`,
clipped to Maui Nui. Attribution: **Overture Maps Foundation · © OpenStreetMap contributors**,
licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The archive's `render_height` uses the reported height, floors × 3 metres, or a 4 metre fallback;
the 3D view displays this limitation. These are contextual estimates, not surveyed elevations.
The extrusion layer comes from `@honua/app-platform/scene-workspace`, and the parcel table and
inspection panel from `@honua/app-platform/web-components`; `@honua/sdk-js` 0.4.0 no longer exports
either. The two packages declare the shared source contract separately, so `src/parcel-browser.ts`
hands the SDK source to the application platform through one typed adapter.

## Compatibility: published SDK queries

Query the imported `maui-zoning` layer with the same filter in JavaScript, Python and .NET.
These examples run one bounded, read-only REST query. They print the source citation and
returned attributes, with at most 20 results; they do not perform parcel overlays, permit
lookups or a complete export, or establish native transport readiness.

From the repository root, install the published packages:

```sh
npm ci --prefix scripts/state-local/sdk
python3 -m venv artifacts/state-local/venv
artifacts/state-local/venv/bin/pip install -r scripts/state-local/sdk/requirements.txt
dotnet restore scripts/state-local/sdk/StateLocal.csproj
```

Use the exact service name and numeric zoning layer ID from the activated deployment
receipt, following [the import recipe](../../docs/state-local-data.md). The layer must
allow anonymous queries; do not put an admin key in a public client.

```sh
export HONUA_BASE_URL=http://localhost:8080
export HONUA_SERVICE_ID=your-published-zoning-service-name
export HONUA_LAYER_ID=0
node scripts/state-local/sdk/query.mjs property
artifacts/state-local/venv/bin/python scripts/state-local/sdk/query.py property
dotnet run --project scripts/state-local/sdk/StateLocal.csproj -- property
```

The shared `property` scenario filters on `zone_code IS NOT NULL`. Select the zoning
layer from the receipt even when parcels and zoning share a service; this query does
not join them. Results describe the imported dataset and do not establish current
zoning or a land-use determination.

## Verification

`verify/county-parcel-fixture.spec.mjs` builds the fixture and drives desktop and phone layouts in Chromium,
blocking and rejecting any external network request. It verifies rendered features, first-click table
selection, attribute inspection, map identify, known overlap values, filtered CSV and selected GeoJSON,
empty lookup recovery and the explicit unavailable address-search state. From the repository root:

```bash
npm ci
npx playwright test county-parcel-fixture --project=chromium
```

These deterministic checks complement live-server verification; they do not prove live PMTiles rendering,
server behavior or a fresh agent's ability to create the application.

Generate a [receipt-bound stock MCP client setup and question](../../docs/state-local-mcp.md)
for the agent moment. Setup generation does not mark the stock-client journey complete.

`verify/county-parcel-viewer.spec.mjs` builds the committed app (`npm ci`, typecheck, `vite build`), serves
`dist/` under `/county-parcel-viewer/app/` as the gallery publishes it, and drives it against the public demo
(`HONUA_SAMPLE_TARGET_BASE_URL`). It fails if any request leaves the app's own origin and the data origin. It covers
the example parcel within the live budget, PMTiles outlines, the shared `?tmk=` link, the assessor and copy links,
TMK normalization and refusal, the POST candidate path, click identify and Back, the zoning and flood failure
states with retry, the overlap module failing to load, a blocked clipboard, address search against the server's
provider, the phone layout and touch targets, keyboard focus, and the framed full-screen link. Live data changes
when the demo is reseeded, so it pins no zoning or flood value. See
[docs/browser-verification](../../docs/browser-verification/README.md).

The page reports for the spec through `data-*` attributes on `<body>` (`data-sample-status` is `loading`,
`pass` or `fail`) and the Technical details text, never through the panel's wording.
