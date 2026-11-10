# Maui County data pipeline

This pipeline downloads real Maui Nui public GIS data and generates explicitly
fictional operational records for four state and local use cases. It prepares
reviewable, disabled department layers through Honua's admin import and publishing
APIs. It does not release Studio apps or establish the four completed demos.

Use Node.js 22 or later from the repository root:

```sh
node scripts/state-local/cli.mjs fetch maui-roads artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-public-schools artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-demo-requests artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-demo-work-orders artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-demo-inspections artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-demo-closures artifacts/state-local/run-001
node scripts/state-local/cli.mjs fetch maui-demo-shelters artifacts/state-local/run-001
```

Each source needs an unused filename set. Use a fresh run directory after a failed
fetch. Fictional records require their verified anchor snapshots in the same
directory: roads for requests, inspections, orders and closures; schools for
exercise shelter activations. Large snapshots and receipts belong in ignored
`artifacts/`, fetched at build/run time. Never commit downloaded evidence.

## Sources and reuse

All real sources below come from the [Hawaii Statewide GIS catalogue](https://planning.hawaii.gov/gis/download-gis-data-expanded/),
which declares its contents public domain. Every download captures that declaration,
the layer metadata and the linked source summary. The table lists API layer paths
under [State GIS services](https://geodata.hawaii.gov/arcgis/rest/services/).
Source summaries live under [State GIS metadata](https://files.hawaii.gov/dbedt/op/gis/data/).
Attribution is retained even for public-domain data.

| Source key | API layer | Source summary / vintage | Attribution |
| --- | --- | --- | --- |
| maui-parcels | ParcelsZoning/MapServer/30 | niparcels.pdf / April 2026 | County of Maui; Hawaii Statewide GIS Program |
| maui-zoning | ParcelsZoning/MapServer/33 | cty_zoning_mau.pdf / July 2025 | County of Maui Planning; State GIS |
| maui-state-land-use | ParcelsZoning/MapServer/20 | slud.pdf / December 2020, May 2023 correction | State Land Use Commission; State GIS |
| maui-special-management-area | ParcelsZoning/MapServer/21 | sma.pdf / Maui May 2018, confirmed November 2023 | County of Maui Planning; State GIS |
| maui-community-plan-areas | ParcelsZoning/MapServer/10 | CommPlanBndries_MauCty.pdf / September 2024 | County of Maui Planning; State GIS |
| maui-island-plan-growth-boundaries | ParcelsZoning/MapServer/15 | maui_island_plan.pdf / 2012 plan, 2022 alignment | County of Maui Planning; State GIS |
| maui-island-plan-growth-areas | ParcelsZoning/MapServer/16 | maui_island_plan.pdf / same vintage | County of Maui Planning; State GIS |
| maui-roads | Transportation/MapServer/5 | roads_mau.pdf / April 2025 | County of Maui Enterprise GIS; State GIS |
| maui-bridges | Infrastructure/MapServer/9 | bridges_nbi.html / June 20, 2025 inventory; state download July 13, 2026 | Federal Highway Administration; Bureau of Transportation Statistics; State GIS |
| maui-flood-hazard | Hazards/MapServer/4 | s_fld_haz_ar_state.pdf / June 2026 | FEMA; State GIS |
| maui-sea-level-rise | Climate/MapServer/45 | slr_exposure_area_3_pt_2_ft.html / 2017 model | UH Coastal Geology Group; PacIOOS; Tetra Tech; State GIS |
| maui-place-names | HistoricCultural/MapServer/2 | geonames.pdf / September 2024, GNIS December 2023 | US GNIS; State GIS |
| maui-tsunami-zones | Hazards/MapServer/2 | tsunevac.pdf / Maui 2013 | County of Maui; State GIS |
| maui-fire-stations | EmergMgmtPubSafety/MapServer/7 | Fire_Stations_All.pdf / December 2025 | Hawaii DOH EMS and Injury Prevention Systems Branch; State GIS |
| maui-public-schools | Infrastructure/MapServer/7 | public_schools.pdf / November 2024 | Hawaii Department of Education; State GIS |

These are envelope intersections across Maui Nui, **not a legal county clip**;
Kalawao may be included, except bridges additionally require Maui County code `009`
and exclude Kalawao code `005`. Bridge ratings are historical source codes, not a
current safety assessment; an unexpected inventory vintage stops the download.
Whole intersecting geometries are retained within statewide coordinate validation
bounds (161°W–154°W, 18°N–23°N); invalid coordinates are counted as rejected. Native
EPSG:3750 is explicitly reprojected by the source API to EPSG:4326. IDs are fetched
first, then paged in batches of 100, with a 100,000-feature safety ceiling. Missing,
duplicate or truncated IDs, changed public-domain terms, unexpected CRS and
source changes detected between before/after metadata and ID checks stop the run.
Attribute edits without editingInfo may remain undetectable: this is not an atomic
upstream transaction. Field allowlists exclude parcel ownership and free text.

Cleaning checks 2D coordinate structure, closed rings and source-specific coordinate
bounds. The Maui Nui envelope `[-157.4, 20.45, -155.95, 21.25]` selects upstream
features; intersecting geometries are retained whole. Cleaning neither repairs nor
certifies topology.
Receipts contain request URLs, retrieval time, source/output CRS, accepted/rejected
counts and SHA-256 hashes of raw rows, cleaned GeoJSON, metadata, policy and source
summary. Stage verifies hashes, provenance and deterministic cleaning before writes.
Unsigned receipts protect against accidental drift, not coordinated forgery.

### Fictional operational records

Honua-authored attributes are dedicated under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
Copied road/school geometry retains its source attribution. The generator provides
468 service requests spanning twelve weeks, 34 work orders across five stages,
24 inspections, 24 exercise closures and 24 fictional shelter activations.
Every feature carries `data_origin=synthetic_demo`, `is_demo=true`,
`exercise_only=true`, a `DEMO DATA` label and a non-operational-use statement.
Labels must survive UI, feeds, exports and agent answers. These are fictional
workflows, districts, crews, conditions and capacities, **not observed activity**.
Schools are not designated shelters. Case URLs use example.invalid and do not
prove delivery to a system of record. No permits are invented or copied.

### Regulatory and permitting limits

Community-plan **area boundaries are not land-use designations**. County-hosted
designations, shoreline setback boundaries and complete separate historic/project
district inventories still need verified reuse terms. Land Use Commission data
omits some county sub-15-acre amendments after 2016; confirm official boundaries
with the Commission. Molokai digital county zoning is absent. Neither overlay
intersection nor a zoning code establishes legal permission to build.

The [County permit lookup](https://publicweb1.co.maui.hi.us/PublicSearch/MAPPSSearch.aspx)
asks for **13 digits**, Island + Zone + Section + Plat + Parcel + CPR, without
dashes (County example: 2240990990000). Its form submits `TMK` by POST; a URL that
prefills it is unverified. Link to the County system with copy/paste instructions;
do not fabricate a `?tmk=` pattern or silently append a condominium CPR suffix to
a nine-digit parcel identifier. [County search guidance](https://mapps.mauicounty.gov/305/Searches-in-MAPPS)
also describes anonymous TMK lookup. This pipeline does not scrape permit records.

Hazard polygons are reference layers, not live warnings. The 3.2-foot SLR model
is long-term exposure, not a storm forecast; Molokai/Lanai coverage has additional
passive-flooding limitations. Emergency stories are preparedness exercises.
Population, live feeds, legal thresholds and hydrological upstream relationships
require independent sources before making those claims.

## Import into department folders

Set `HONUA_BASE_URL`, `HONUA_ADMIN_API_KEY` and `HONUA_SAMPLE_CONNECTION` for an
isolated default PostGIS server and its managed import database. Create active
folders in Console with exact titles `Planning`, `Public Works`,
`Emergency Management` and `311`; valid names include `planning`, `public-works`,
`emergency-management` and `service-requests`.

```sh
node scripts/state-local/cli.mjs stage maui-roads artifacts/state-local/run-001
```

The script resolves exactly one active department folder, uploads GeoJSON through
`/api/v1/admin/import/upload`, then publishes a **disabled** layer through the
managed connection API with its folder ID, attribution, licence and snapshot hash.
Runs create unique table/service names and are not idempotent. Inspect Console
before retrying a failed import; tables or jobs can remain behind.
Background completion currently stops at the missing physical-table receipt
([tracked server issue](https://github.com/honua-io/honua-server/issues/7217));
synchronous imports can continue. No database credentials belong in browser code.

After staging, the CLI verifies the disabled layer's table, service, snapshot hash
and department folder, then saves a private `<source>.deployment.json` receipt
beside the snapshot. The receipt contains the server URL and connection ID, never
the admin API key. Keep it with the ignored snapshot directory.

Review the imported records and provenance in Console before making them public:

```sh
node scripts/state-local/cli.mjs activate maui-roads artifacts/state-local/run-001
```

Activation revalidates the snapshot and deployment receipt against this server,
checks the current table and folder, grants anonymous read access with anonymous
writes disabled through the service access-policy API, then enables the layer
through the managed connection API. It confirms that policy and anonymously
fetches the public layer metadata to verify its ID. Repeated activation does not
create another layer. A changed table, service, source hash, folder or
server stops activation. Staging remains non-idempotent; if saving its receipt
fails, inspect Console before attempting another import.

After reviewing and activating all nine property layers, build a receipt-bound
public app link:

```sh
node scripts/state-local/cli.mjs property-app maui artifacts/state-local/run-001
```

This read-only command checks every source receipt and its current enabled
publication, then returns the app URL with all nine explicit layer URLs. It
disables legacy parcel-outline tiles so fresh parcel geometry is authoritative.
Missing or disabled layers stop link generation; no old service ID is substituted.

The existing Orleans preview keys remain available for compatibility, with their
original licence and bounding-box checks. They are not the selected demo community.

## Review and load limits

Public-domain Hawaii imports use `LicenseRef-Hawaii-Statewide-GIS-Public-Domain`
with the terms URL and source attribution retained on each layer. This local
licence identifier describes the verified source terms; it is not an SPDX
standard licence. Fictional operational records are CC0-1.0 with separate
attribution for their public-domain geometry anchors.

The approved shared-demo load budget is under 1 GB including indexes: no raster
loads into PostGIS, simplified display geometry, low-traffic loading, and fewer
than 130 concurrent database connections. Use the deployment operator's approved
credential and monitoring path before loading the shared server; check capacity
during the load and stop if its budget is exceeded. The small CI sample uses a
disposable server and imports disabled layers; it never changes the public demo database.

## Verification

```sh
node --test scripts/test/state-local-data.test.mjs scripts/test/maui-data.test.mjs
```

Unit tests cover pagination, CRS, minimisation, corrupt receipts, changed sources,
fictional labels and deterministic counts. Candidate-server import checks are
separate; none of these checks establishes a released demo or an agent eval pass.

## Bounded shared load

Staging checks every prepared layer against the pinned default server's geometry
budget before making any server request: 10,000 vertices and 100 total polygon
rings per feature. Single-layer uploads use the same check. An excess stops the
load with the original source feature ID and measured counts; no geometry is
discarded. Resolve the supported import contract before staging complex public
coastal or regulatory layers. Preparation and valid checksums alone do not prove
importability, and this size check does not validate topology or predict geometry
repair outcomes. Rollback remains available for previously staged layers.

The shared loader prepares the nine property layers as display geometry in EPSG:4326
with a 0.00002-degree simplification tolerance and six decimal places. These layers
are for public display, not legal boundary measurement. No source raster is loaded.

```sh
node scripts/state-local/shared-load.mjs prepare artifacts/shared-load
node scripts/state-local/shared-load.mjs stage artifacts/shared-load REVIEWED_PLAN_SHA256
node scripts/state-local/shared-load.mjs activate artifacts/shared-load REVIEWED_PLAN_SHA256
node scripts/state-local/shared-load.mjs rollback artifacts/shared-load REVIEWED_PLAN_SHA256
```

`prepare` prints the plan SHA-256, row counts, checksums and conservative storage
reservation. Keep this artifact and review it before any authenticated action.
The reservation is an admission estimate; operators must monitor actual storage
and connections throughout the load. The loader requires one existing `demo-rds`
managed connection and creates no database connection or infrastructure.

For `stage`, set `HONUA_SAMPLE_IMPORT_URLS_FILE` to a temporary JSON object mapping
each source name to a short-lived HTTPS download URL. Each URL path must contain
that source's complete clean SHA-256 as a path segment. The loader downloads and
checks its exact size and digest before asking Honua's URL import API to ingest
it. Use immutable content-addressed objects; keep URLs valid for the import and
expire them promptly. Import job history may retain these URLs, so never use
permanent bearer URLs. The URL map is a credential: do not retain it in artifacts.

Stages are disabled. Retained deployment receipts bind the server, managed
connection, physical table, folder, source checksum, service and public path.
A retry reuses verified receipts. An intent without a deployment receipt stops
retries and rollback for that layer: inspect Console and reconcile the named
physical table and service first. Never retry from a fresh artifact directory.
Activation first checks every layer receipt, then enables anonymous reads and
verifies public metadata. Rollback disables only verified owned layers; it does
not delete tables or alter unrelated publications. Keep failed-run artifacts too.
