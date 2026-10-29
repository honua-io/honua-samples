# County parcel viewer

A parcel viewer a small county can run on Honua instead of a Tax Parcel Viewer template. Find a parcel by
its number (TMK on Maui), by street address or by clicking it on the map, and see:

- the zoning districts that cover it, each with its share of the parcel;
- the FEMA flood zones it touches, with FEMA's plain meaning and share, worded so the page never claims a
  flood determination;
- its assessor record link, acreage, and the fields the county data does not carry (land use, owner);
- a link to that parcel you can copy and share.

It is a Vite app built on the published Honua JavaScript SDK (`@honua/sdk-js@0.2.10`, pinned in
`package-lock.json`), running on public Maui County demo data. It is not affiliated with the County of Maui.

| | |
| --- | --- |
| Goal | Build a county map app on Honua |
| Level | Intermediate |
| Time | About 20 minutes |
| Prerequisites | Node.js 22.12 or later, a modern web browser, internet access |
| Libraries | `@honua/sdk-js` 0.2.10, `maplibre-gl` 6.4.1, `pmtiles` 4.5.0, `@fontsource` Public Sans 5.3.0 and Source Serif 4 5.3.1 |

## Run

```bash
npm ci
npm run dev
```

Open the URL Vite prints. The first load shows an example parcel (TMK 2-3-4-008:053, downtown Wailuku). `npm run build` typechecks
and writes the static app to `dist/`; any static file server can host it, at any path (`base: "./"`).

## What the code does

| File | Job |
| --- | --- |
| `src/data.ts` | `connect()` discovers each FeatureServer layer with a client whose `fetchFn` is the request logger. `QueryBuilder` then runs the TMK lookup (`where=tmk_txt='<9 digits>'`), the point identify for a map click or a geocoded address, and the zoning and flood candidate queries, sent as `POST` with the parcel polygon as `geometry`. |
| `src/overlap.ts` | Converts the Esri JSON answers to GeoJSON, groups polygons by `zone_code` / `fld_zone`, merges each group with `union`, clips it to the parcel with `intersect` and measures it with `area` (geodesic m²), all from `@honua/sdk-js/geometry`. |
| `src/map.ts` | MapLibre draws the server's Protomaps basemap and the parcel outlines from the static PMTiles archive `maui-parcels-static`, mounted with `registerPmtilesSource` from `@honua/sdk-js/pmtiles` and the `pmtiles` protocol. The selected parcel is a filter on those tiles. |
| `src/tmk.ts` | TMK input: spaces, `-`, `:` and `.` are stripped and only `^[0-9]{9}$` is accepted, so `2-1-5-010:077` searches `215010077`. Anything else shows "Not a valid TMK" and sends no request. |
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

Parcels are drawn only from the PMTiles archive. FeatureServer answers are used for lookups, identify and the
overlap math, never to draw parcels.

### Address search

Address search uses the server's GeocodeServer (`World` locator). The page credits OpenStreetMap, so it first
reads the locator's provider and only sends an address when the provider is Nominatim (OpenStreetMap). Any other
provider gets "Address search is unavailable right now. Search by TMK instead." On 2026-10-28 demo.honua.io reported
`amazon-location`, so address search on the demo stays off until its geocoder is switched to Nominatim.

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
| `basemap` | (on) | `none` skips the server's `maui-basemap` PMTiles basemap. |

Share links keep these parameters. There is no field mapping: your layers need the field names above.

## Verification

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
