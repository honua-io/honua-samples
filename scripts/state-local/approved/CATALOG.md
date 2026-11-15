The public catalog at `/state-local/catalog/` is a static projection of the
verified display snapshot. It does not claim a live Honua catalog or county
operational connection. The publisher source links and snapshot GeoJSON URLs
are the available signed-out API links. The catalog JSON is the adapter boundary
for the public server catalog when that service is available.

Only datasets with a `public-domain` source receipt in the pinned manifest are
exported, plus the two explicitly fictional exercise collections. Records without
that receipt and restricted sources are excluded. Demo exports use an explicit
property allowlist and retain demo warnings, including in CSV and GeoParquet.
Every format carries attribution, license, snapshot date and the display warning.
GeoParquet uses WKB geometry and the default OGC:CRS84 longitude/latitude CRS.
CSV prefixes spreadsheet formula-like text with an apostrophe.

Build and verify from the repository root:

```sh
python3 -m venv artifacts/catalog-python
artifacts/catalog-python/bin/pip install -r scripts/state-local/approved/catalog-requirements.txt
HONUA_CATALOG_PYTHON=artifacts/catalog-python/bin/python node scripts/state-local/build-display-site.mjs
artifacts/catalog-python/bin/python -m unittest discover -s scripts/state-local/approved -p test_catalog.py -v
npm ci
npx playwright install chromium
node scripts/smoke-public-catalog.mjs
```

The pinned November 10 snapshot has 14 public datasets and two demo datasets.
The displayed search evaluations use local keyword matching, with no generated
answer. `show me flood data` must return FEMA flood hazard zones (97 features)
and sea-level rise exposure (1 feature). `parcels with flood zones` also returns
Parcels (TMK), with 2,538 features. These counts, source receipts and snapshot
date are visible on the dataset pages and are asserted by the browser journey.
The browser also checks all 48 download URLs signed out, the full feature table,
clipboard URLs, demo filtering, light/dark themes and desktop/mobile widths.
