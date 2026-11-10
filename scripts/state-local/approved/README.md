# Maui snapshot screens

The screens preserve the reviewed demo layouts, including light/dark themes, map overlays,
agent panels and mobile layouts. They are public snapshot previews. Scripted responses are
labelled **Demo answer**; approvals create a local preview only. Live Studio, Console and
MCP journeys require the corresponding running Honua services.

## Reproduce the display data

Use Node 22+, Python 3.12, Shapely 2.1.2 and pyproj 3.7.2. Run from the repository root:

```sh
python3 -m venv artifacts/ui-python
artifacts/ui-python/bin/pip install shapely==2.1.2 pyproj==3.7.2
node scripts/state-local/approved/fetch.mjs artifacts/approved-receipts
mkdir -p artifacts/approved-data
artifacts/ui-python/bin/python scripts/state-local/approved/process.py artifacts/approved-receipts artifacts/approved-data
artifacts/ui-python/bin/python scripts/state-local/approved/generate-exercise.py artifacts/approved-data artifacts/approved-data
artifacts/ui-python/bin/python scripts/state-local/approved/derive-culvert-counts.py artifacts/approved-data
node scripts/state-local/approved/pack.mjs artifacts/approved-data artifacts/approved-receipts artifacts/approved-package
```

`fetch.mjs` checks raw, metadata and policy receipts for 21 Hawaii Statewide GIS sources.
Their policy permits public-domain redistribution; retain Hawaii Statewide GIS and each
layer's source attribution. The release manifest records exact URLs, retrieval times,
licence-policy receipts, original CRS, selection, and hashes. Source coordinates are
explicitly requested in EPSG:4326; source metadata records EPSG:3750. Display processing
clips to Kahului, repairs geometry, simplifies boundaries and joins planning/hazard
layers to parcel representative points. These visual joins are not a legal determination.
Distance counts use EPSG:32604. Community-plan boundaries and shoreline setbacks are
not invented: their sources remain pending.

311 requests, assets and work orders are deterministic fictional records with
`data_origin=synthetic_demo`. School locations are real; shelter activation is an
exercise, not a designated-shelter assertion. The property page links to the County's
MAPPS public search and displays the TMK to enter there; no unsupported deep-link format
or fictional permit record is presented. Regulatory decisions require County review.

Large data and receipts stay under ignored `artifacts/`. The display build downloads a
checksum-pinned release archive from `config/state-local-display.v1.json`, verifies every
file, and exposes its manifest and labelled exports. The download is an optimization;
the source pipeline above regenerates the data without a private dependency. Upstream
changes yield new hashes and must be reviewed before updating the release lock.

```sh
node scripts/state-local/build-display-site.mjs
node scripts/smoke-state-local-display.mjs
```

Importing these sources into department folders uses the separate Maui import pipeline;
these snapshot pages do not claim to have completed that live-server journey.
