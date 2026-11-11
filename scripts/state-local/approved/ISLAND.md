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
native archive job API. Each layer covers zooms 8–14 over the Maui Nui envelope:
3,660 requested tiles, within the default 5,000-tile ceiling. Higher display zooms
can overzoom these tiles. The MVT source layer is `layer`.

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
