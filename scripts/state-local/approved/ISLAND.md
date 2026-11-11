# Maui island import and Honua tile exports

Run from the repository root with Node 22+, Python 3.12 and Docker Compose.
The default Compose image is the pinned, PostGIS-only release candidate; no
optional tile service or paid hosting is required. All downloads, prepared data,
deployment receipts and tile archives remain in ignored `artifacts/`.

## Download and prepare

```sh
python3 -m venv artifacts/island-python
artifacts/island-python/bin/pip install -r scripts/state-local/approved/geometry-requirements.txt
node scripts/state-local/approved/fetch.mjs artifacts/island-download --island
HONUA_GEOMETRY_PYTHON=artifacts/island-python/bin/python \
  node scripts/state-local/approved/prepare-island.mjs artifacts/island-download artifacts/island-import
```

The selection intersects the Maui Nui envelope, not an administrative boundary
clip. Coastline is explicitly filtered to Maui. Every source is Hawaii Statewide
GIS public-domain data; the source receipt retains the originating attribution,
licence-policy response, source metadata, exact queries and SHA-256 hashes.
Requests explicitly reproject native EPSG:3750 to EPSG:4326 and request approximately
one metre display generalization. They are unsuitable for survey measurements.

Preparation preserves the requested coordinates. It uses Shapely 2.1.2 `make_valid`
for invalid source geometries, records each repair, and subdivides geometries to
meet the default import limits of 10,000 vertices and 100 polygon rings per feature.
It retains every dimension of repaired geometry collections, checks subdivision
coverage, and preserves each original ID in `source_objectid`. Import IDs identify
the parts; count original features by distinct `source_objectid`. The preparation
manifest records GEOS/Shapely versions, repairs, part counts and both checksum chains.

## Start an isolated server and import

Use dedicated ports and a dedicated Compose project. The archive bind directory
must be writable by the server's container group, 1001. This setup retains the
host user's ownership and grants no public directory access.

```sh
export HONUA_TILE_STORAGE_ROOT="$PWD/artifacts/island-storage"
export HONUA_HTTP_PORT=18085 POSTGRES_PORT=15435
mkdir -p "$HONUA_TILE_STORAGE_ROOT"
docker compose -p samples-island -f docker/compose.yml -f docker/compose.island-tiles.yml \
  run --rm --no-deps --user 0 --entrypoint bash honua -c \
  'chgrp 1001 "$FileStorage__LocalStorage__BasePath" && chmod 2770 "$FileStorage__LocalStorage__BasePath"'
docker compose -p samples-island -f docker/compose.yml -f docker/compose.island-tiles.yml up -d --wait
export HONUA_BASE_URL=http://localhost:18085
export HONUA_ADMIN_API_KEY=quickstart-admin-password
export HONUA_SAMPLE_CONNECTION=island-local
node scripts/state-local/approved/stage-island.mjs \
  artifacts/island-download artifacts/island-import artifacts/island-deployments
```

Staging verifies every snapshot before changing the server. It creates the four
department folders, imports through Honua's upload endpoint, publishes disabled
layers, and verifies their physical tables, folders and checksum descriptions.
Receipts bind each layer to this server, managed connection and prepared snapshot.
Reruns verify existing receipts and resume missing layers. An interrupted import
without a receipt requires inspecting its Console job before retrying.

## Export static vector tiles

```sh
node scripts/state-local/approved/export-island.mjs \
  artifacts/island-download artifacts/island-import artifacts/island-deployments artifacts/island-tiles
```

This exports parcels, zoning, flood, tsunami, roads and contours through Honua's
native archive job API over the Maui Nui envelope, up to zoom 14, within the default
5,000-tile ceiling. Each archive starts at the lowest zoom the island map draws it
(`islandTileMinZoom` in `sources.mjs`): parcels z13, roads z12, contours z11, the
others z8 (3,660 tiles). A test fails if a map layer draws a trimmed archive below
its exported zoom. Higher display zooms overzoom these tiles. The MVT source
layer is `layer`.

Run this against a private build server. Honua requires a routable layer for tile
export, so each disabled staged layer is temporarily enabled, then restored and
verified disabled in a `finally` block before its archive is saved. Access policies
are unchanged. If the process is forcibly terminated, inspect and disable that
layer in Console before retrying; an already enabled layer is refused.

Every requested tile must be processed with no failures or warnings; empty ocean
tiles may be omitted. The export checks the PMTiles v3 header, exact byte count,
100 MB per-archive budget and SHA-256. Signed download URLs are excluded from saved
receipts. Local file downloads require the explicit shared storage root and cannot
escape it through symlinks. Delete the isolated Docker build volume after use.
HTTPS downloads never receive the administrator key.
Existing archives are reused only when their receipt and checksum match the
prepared source. An archive without its receipt is refused for manual inspection.

These commands prepare and export data; they do not configure anonymous access,
change public hosting or publish a demo. Retain source attribution when packaging
archives into an approved public site build.


## Package the static display

```sh
node scripts/state-local/approved/pack-island.mjs \
  artifacts/island-download artifacts/island-import artifacts/island-tiles artifacts/island-display
```

The package retains all twenty sources and their licence, attribution and checksum
receipts. Six sources use Honua-generated PMTiles; fourteen smaller overlays use
GeoJSON. Display aliases preserve original fields and label every feature as real
reference data. Exercise shelters, requests and work orders remain separate.
The reviewed archive SHA-256 is pinned in `config/state-local-display.v1.json`;
site builds download it at build time and verify every extracted file.
Release the pinned data asset before enabling a clean public site build.

The 2026-11-11 exports use the default PostGIS-only image (nightly, server commit
`8fe5493`) and processed every requested tile with no failures or warnings:

| Layer | Zooms | Requested tiles | PMTiles bytes |
| --- | --- | ---: | ---: |
| Parcels | 13–14 | 3,394 | 18,494,778 |
| Zoning | 8–14 | 3,660 | 5,286,007 |
| Flood zones | 8–14 | 3,660 | 4,824,988 |
| Tsunami zones | 8–14 | 3,660 | 1,529,539 |
| Roads | 12–14 | 3,581 | 2,233,213 |
| Contours | 11–14 | 3,635 | 10,229,368 |
| Total | | | 42,597,893 |

Starting each archive at its drawn zoom cut the total from 59,820,586 bytes
(2026-11-10, all layers z8–14) by 29%. Tiles are stored uncompressed: the export
cannot yet write gzip tiles (honua-server#7361).

Chromium-family browsers read the archives with the browser HTTP cache bypassed
(`island-map.js`; pmtiles.js does this only on Windows). With the cache, concurrent
range reads of one archive intermittently returned another request's bytes and
tiles failed to parse. The CDN still caches.

The street basemap reuses the existing public Maui Protomaps archive from the demo
server (7,089,102 bytes, OpenStreetMap/ODbL attribution). It creates no new hosting
resource. Honua archives are static files served with HTTP byte-range support.

## Check camera interaction and performance

After building the gallery into `site/`, run:

```sh
node scripts/measure-island-maps.mjs
```

Set `HONUA_GALLERY_URL` to test a deployed gallery instead. The script checks all
six full maps at Kahului, Lahaina, Kihei and island extent, then verifies that
reloading the shared URL restores the camera. Reports and screenshots stay in
ignored `artifacts/island-performance/`. It fails on browser/map errors, tile
readiness above one second, or main-thread tasks above 200 ms. Readiness includes
the 300 ms camera animation; it is not a pixel-based blank-tile assertion.
The default software GL run is diagnostic: record the renderer and network with
the numbers, and verify the broadband target on a hardware-accelerated browser
before claiming that target passes.
