# State and local data previews

This pipeline prepares bounded previews from New Orleans' official open-data
portal. The county selection is provisional. Emergency sources, road centerlines,
hydrants, inspections and actual work orders are not yet included: their coverage
and redistribution terms still need verification. These scripts do not constitute
the four completed demos.

Node.js 22 or later is required. Run from the repository root:

```sh
node scripts/state-local/cli.mjs fetch basins artifacts/state-local/run-001
```

Choose `parcels`, `zoning`, `permits`, `requests`, `basins` or `cleanings`.
Each source needs a fresh output directory. Fetch records at build/run time;
keep snapshots and receipts under ignored `artifacts/`. Do not commit downloaded
records. A failed run can leave partial files; choose a fresh directory on retry.

Each preview selects **at most the first 5,000 rows ordered by source row ID**.
This is neither a representative sample nor a complete county inventory. The
receipt records this selection, every request URL, retrieval time, source revision,
licence, attribution and SHA-256 hashes for raw rows, cleaned GeoJSON and metadata.
The script rejects a licence change, source revision change during pagination,
missing/duplicate IDs and HTTP failures. Metadata timestamps are the portal's
revision signals; they do not provide a transactional source snapshot.

The portal returns longitude/latitude in EPSG:4326, which is retained without
reprojection. The cleaner accepts 2D GeoJSON geometries with valid coordinate
structure and closed polygon rings. It rejects missing coordinates, 0/0 and
features with any coordinate outside `[-90.3, 29.8, -89.6, 30.2]`. This rectangle
is a demo extent, **not an Orleans Parish boundary clip**. The receipt records
accepted and rejected counts. It does not certify polygon topology or repair
self-intersections. Only the source-specific field allowlist is fetched; owner,
applicant, contractor and free-text descriptions are excluded. Cleaning activity
comes from the portal dataset titled "Catch Basin Cleanings / Inspections";
these selected fields show historical maintenance and do not establish inspection
results or a work-order system.

## Stage through the Honua admin import flow

Configure `HONUA_BASE_URL`, `HONUA_ADMIN_API_KEY` and `HONUA_SAMPLE_CONNECTION`
in your environment. The connection must identify the server's managed import
database. Use an isolated demo server running the current default PostGIS image.

```sh
node scripts/state-local/cli.mjs stage basins artifacts/state-local/run-001
```

Staging verifies snapshot hashes and rebuilds the cleaned collection before any
server write. It uploads GeoJSON through `/api/v1/admin/import/upload`, then
publishes a **disabled** layer through the connection's admin publishing flow.
It carries source attribution, licence URL and snapshot hash into layer metadata.
The service names are flat: `planning-<source>-<run>`,
`public-works-<source>-<run>` and `311-<source>-<run>`. Department folders are an
unmet requirement: current service routes accept a single path segment.
Emergency Management awaits cleared sources. Each run creates new names. This is not an idempotent updater.
Inspect the returned table/service in Console before retrying or removing it;
failed imports/publications can leave staged tables or jobs.

For background uploads, the script polls the import job and stops with its job ID.
The current job-status response does not expose the completed physical table
receipt, so automated publication cannot safely continue. Review that import in
Console and publish manually; do not rerun it blindly. Synchronous uploads can
continue to disabled publication. Real-server validation remains pending.

The script does not enable anonymous access or release a Studio application.
Those steps require a verified candidate-server run and reviewed data. No
database credentials or source records belong in a public browser bundle.

## Sources and reuse

| Source | Official dataset | Terms checked by the pipeline | Attribution |
| --- | --- | --- | --- |
| Parcels | [v9q5-fz7t](https://data.nola.gov/d/v9q5-fz7t) | [City Policy 135 §V.2](https://nola.gov/nola/media/CAO/Policy/No-AA135-Data-Policy.pdf) | City of New Orleans |
| Zoning | [bizp-xi7c](https://data.nola.gov/d/bizp-xi7c) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) | City Planning Commission |
| Permits | [rcm3-fn58](https://data.nola.gov/d/rcm3-fn58) | CC0 | Safety and Permits |
| Service requests | [2jgv-pqrq](https://data.nola.gov/d/2jgv-pqrq) | CC0 | Orleans Parish Communications District |
| Catch basins | [se4p-ierc](https://data.nola.gov/d/se4p-ierc) | CC0 | Department of Public Works |
| Basin cleaning activity | [2zer-6wpb](https://data.nola.gov/d/2zer-6wpb) | City Policy 135 §V.2 | Department of Public Works |

For policy-covered sources, the pipeline requires the dataset's `licenseId` to
remain absent and records the policy URL. This is an explicit policy review;
absence of a machine-readable licence is not itself permission. Other sources
must retain `CC0_10` in the portal metadata. Recheck terms before extending the
source list, changing fields, or publishing a new county's data.

## Local verification

```sh
node --test scripts/test/state-local-data.test.mjs
```

Tests use synthetic records generated in memory. They verify pagination,
coordinate rejection, field minimisation, change/corruption detection and the disabled
admin import contract. The receipt is unsigned and stored alongside its files:
these checks do not establish authenticity against deliberate edits to both files
and receipt. They do not replace real-server candidate CI.
