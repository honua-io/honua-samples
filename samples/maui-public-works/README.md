# Maui public works exercise

Start with the [native application path](../../docs/native-applications.md):
authenticated gRPC for live queries and approved edits, browser gRPC-Web setup,
and versioned PMTiles/GeoParquet/COG range reads through the CDN for public or
read-heavy data. Private files require authorized signed URLs and regeneration
when data changes. The guide records this app's remaining native migration gaps.
Existing REST SDK calls and OGC feeds below are **compatibility** examples; they
do not establish native transport readiness.

## Compatibility: published SDK queries

Query `maui-demo-work-orders` with the same filter in JavaScript, Python and .NET.
These examples are one bounded, read-only query, not the complete Studio/MCP demo.
They print the source citation and all returned attributes, including exercise labels.
Results are limited to 20; they are not a complete export or a dashboard total.

From the repository root, install the published packages:

```sh
npm ci --prefix scripts/state-local/sdk
python3 -m venv artifacts/state-local/venv
artifacts/state-local/venv/bin/pip install -r scripts/state-local/sdk/requirements.txt
dotnet restore scripts/state-local/sdk/StateLocal.csproj
```

Set these to the anonymously readable layer recorded by the Maui import pipeline.
Use the exact service name and numeric layer ID from the activated deployment receipt;
do not use an admin key in a public client.

```sh
export HONUA_BASE_URL=http://localhost:8080
export HONUA_SERVICE_ID=your-published-service-name
export HONUA_LAYER_ID=0
node scripts/state-local/sdk/query.mjs public-works
artifacts/state-local/venv/bin/python scripts/state-local/sdk/query.py public-works
dotnet run --project scripts/state-local/sdk/StateLocal.csproj -- public-works
```

Default filter: `record_type = 'work_order' AND status = 'exercise_scheduled'`.

**DEMO DATA:** operational records are fictional exercises over real public geometry. They are not actual requests, work orders, closures or designated shelters. The snippets reject records missing their exercise markers.

## Real-server contract check

Generate a [receipt-bound stock MCP client setup and question](../../docs/state-local-mcp.md)
for the agent moment. Setup generation does not mark the stock-client journey complete.

```sh
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=your-local-admin-key \
node scripts/state-local/sdk/verify.mjs public-works
```

This command **writes synthetic test data** to the disposable server, then runs all
three published SDKs anonymously. Never point it at the shared demo or a production
server. CI checks the filter, returned feature IDs, geometry and exercise labels.
Its `PW-01` test name identifies the SDK query portion only; it does
not claim the full UI requirement passes. Dependencies must be installed as above;
set `HONUA_SAMPLE_PYTHON` to the virtual environment's Python executable.

[Import data and record provenance](../../docs/state-local-data.md).

## Real bridge condition inventory

Fetch the Hawaii Statewide GIS distribution of the federal National Bridge Inventory:

```sh
node scripts/state-local/cli.mjs fetch maui-bridges artifacts/state-local/bridges
```

This source is **2025-06-20 inventory**, downloaded by the state on 2026-07-13.
It is historical, not a current inspection or an assessment of safety. The pipeline selects
county code `009` (Maui County) within the documented Maui Nui envelope; Kalawao County
(code `005`, including Kalaupapa) is excluded. The download stops if the source vintage
statement changes. It keeps original NBI structure identifiers, inspection date codes
and deck, superstructure, substructure,
culvert and overall condition fields. It does not replace missing ratings with estimates.
Condition values remain source codes; `N` means not applicable, not a zero rating.
The inventory includes bridges and qualifying culverts, not every drainage culvert.

Attribution: Federal Highway Administration; Bureau of Transportation Statistics (distributor);
Hawaii Statewide GIS Program. [Dataset metadata and unrestricted public-use terms](https://files.hawaii.gov/dbedt/op/gis/data/bridges_nbi.html).
The snapshot receipt records the source vintage, licence, attribution, input CRS, explicit
reprojection to EPSG:4326, selection and checksums. The existing stage/activate import flow
loads it into the Public Works department; it is not automatically added to the shared demo.

FHWA also publishes a [2026 inventory](https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm)
with a different schema. This sample uses the state's explicitly licensed 2025 distribution;
it makes no claim to contain the latest ratings. Inlets, traffic signals and hydrants remain
unverified source gaps. Fictional work orders and inspections remain clearly labelled exercises.

## Browser inventory and maintenance board

Build the app with `npm ci --prefix samples/maui-public-works` and
`npm run build --prefix samples/maui-public-works`. Serve its `dist/` directory with
an HTTP server. Supply the activated service names and numeric layer IDs in the URL:

```text
?baseUrl=http://localhost:8080&bridgeService=BRIDGES&bridgeLayer=1&orderService=ORDERS&orderLayer=2&inspectionService=INSPECTIONS&inspectionLayer=3
```

Only the approved public demo origin or disposable localhost is accepted. No API key
belongs in this URL. Bridge imports must carry the verified `Data vintage 2025-06-20`
metadata written by the current pipeline. The app fetches complete, ordered snapshots,
checks counts and identifiers, and rejects mismatched exercise dates or provenance.
An unsuccessful refresh hides the previous inventory until a successful retry.

The map filters by dataset, condition, stage and record or crew text. The five-column
board shows every fictional order; crew counts show assignments, not capacity or
live locations. Selecting an order links inspections only by its exact road asset key.
Real bridges have no fabricated association with those road exercises.

Offline field editing/sync, DCAT catalogue publication, EAM integration and agent
writes are not connected in this view. The complete demo remains unreleased until
those flows and the Studio/Console/MCP journey pass their acceptance checks.
