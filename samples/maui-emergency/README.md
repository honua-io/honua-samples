# Maui emergency preparedness exercise

Start with the [native application path](../../docs/native-applications.md):
authenticated gRPC for live queries and approved edits, browser gRPC-Web setup,
and versioned PMTiles/GeoParquet/COG range reads through the CDN for public or
read-heavy data. Private files require authorized signed URLs and regeneration
when data changes. The guide records this app's remaining native migration gaps.
Existing REST SDK calls and OGC feeds below are **compatibility** examples; they
do not establish native transport readiness.

This public browser slice reads fictional shelter and road-closure exercises from
Honua through the published JavaScript SDK. It checks both layers, every query
page, exercise labels, source anchors, UTC timelines and fictional occupancy.
It refreshes every 60 seconds and on demand. A failed check hides the resources;
the last successful check time is retained and does not establish source freshness.

School points are geographic anchors, not designated shelters. Road lines do not
establish actual closures. Capacity and occupancy are invented; totals exclude
closed shelters. No operational use or evacuation guidance.

## Run the public exercise map

Import `maui-demo-shelters` and `maui-demo-closures` through the
[department pipeline](../../docs/state-local-data.md). Use the exact published
service names and numeric layer IDs from the approved receipts. Public reads must
be enabled explicitly; no administrative credential belongs in the browser URL.

```sh
npm ci --prefix samples/maui-emergency
npm run build --prefix samples/maui-emergency
npm exec --prefix samples/maui-emergency -- vite preview --host 127.0.0.1
```

Open the preview URL with these query parameters (replace the four placeholders):

```text
?baseUrl=http://localhost:8080&shelterService=SHELTER_SERVICE&shelterLayer=SHELTER_LAYER&closureService=CLOSURE_SERVICE&closureLayer=CLOSURE_LAYER
```

The browser permits the approved `https://demo.honua.io` origin and disposable
localhost servers. An unbound page displays setup instructions. In the gallery,
the app is published at `/maui-emergency/app/` with the same parameters.

Filters, resource selection and pagination work on the complete loaded set.
Map markers and table buttons open the same record details, including the exact
source-layer link and fictional occupancy. All map resources are local; no
basemap tile service is required.

This is a bounded, read-only slice. Released Studio apps, the Console journey,
verified stock-client MCP execution, routing, live alerts,
private EOC roles and approved situational reports remain separate delivery gates.
The page includes the realistic MCP question; displaying that question is not
evidence that an agent executed it.

## Compatibility: published SDK queries

Query `maui-demo-shelters` with the same filter in JavaScript, Python and .NET.
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
node scripts/state-local/sdk/query.mjs emergency
artifacts/state-local/venv/bin/python scripts/state-local/sdk/query.py emergency
dotnet run --project scripts/state-local/sdk/StateLocal.csproj -- emergency
```

Default filter: `record_type = 'exercise_shelter' AND status <> 'exercise_closed'`.

**DEMO DATA:** operational records are fictional exercises over real public geometry. They are not actual requests, work orders, closures or designated shelters. The snippets reject records missing their exercise markers.

## Real-server contract check

Generate a [receipt-bound stock MCP client setup and question](../../docs/state-local-mcp.md)
for the agent moment. Setup generation does not mark the stock-client journey complete.

The browser contract runs through the capability-keyed sample manifest against a
disposable, default PostGIS-only candidate server:

```sh
npx playwright test samples/maui-emergency/verify/exercise.spec.mjs
```

Install the SDK dependencies below and set `HONUA_SAMPLE_PYTHON` before running.
The browser check imports synthetic validation fixtures through Honua's own API,
checks all three published SDKs, then exercises the rendered map and refresh.
The fixture geometry is synthetic, not county source evidence. Generated browser
captures stay in ignored artifacts; real source data is fetched by the pipeline.

```sh
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=your-local-admin-key \
node scripts/state-local/sdk/verify.mjs emergency
```

This command **writes synthetic test data** to the disposable server, then runs all
three published SDKs anonymously. Never point it at the shared demo or a production
server. CI checks the filter, returned feature IDs, geometry and exercise labels.
The bounded `EM-01` browser slice checks the rendered map, filters, fictional
occupancy and keyboard detail selection. It does not claim the full released
Studio/MCP journey passes. Dependencies must be installed as above;
set `HONUA_SAMPLE_PYTHON` to the virtual environment's Python executable.

[Import data and record provenance](../../docs/state-local-data.md).


## Geographic context and public exercise lookup

Optional `tsunamiService`, `tsunamiLayer`, `roadsService`, and `roadsLayer`
query parameters connect the Maui layers from approved deployment receipts.
They are all-or-none; the exercise shelter and closure bindings are unchanged.
No remote tiles, geocoder, routing service or paid service is added. Without
verified zone data, the lookup explicitly reports that it cannot check a point.
Coordinate input and browser geolocation are bounded to the Maui exercise area.
Zone checks preserve polygon holes and count boundary points as intersections.
Nearest-school distances are straight-line measurements, never travel times.
School anchors are not designated shelters; all statuses and occupancy are fictional.

## SDK coverage cuts

- SDK-03: a 60-second server check is not a realtime stream. Realtime gauges
  remain cut pending a deployment with advertised feature-stream support
  (tracked in the SDK issue #2375).
- SDK-04: SDK isochrone support was implemented in SDK change #2384,
  resolving SDK issue #2374. Travel-time polygons remain cut until an existing
  routing provider is approved and verified for Maui; [provider verification](https://github.com/honua-io/honua-samples/issues/127) tracks that work.
  No synthetic buffer is presented as an isochrone.
- SDK-05: imagery comparison remains cut until a public COG has a current,
  attested source/licence and approved deployment binding. This page does not
  use historical disaster imagery. A missing data receipt is not an SDK defect.
- SDK-06: terrain remains cut pending fresh source and deployment attestation;
  retired or unattested terrain endpoints are not used.
- EM-02: special-needs and pets intake remain cut; the exercise does not collect
  personal information or imply that any school offers these services.

The snapshot exercise can publish independently of live API activation after
visual approval and browser verification. Live SDK capabilities remain gated on
their deployment and provider receipts; a fixture does not establish live readiness.

Imagery comparison and terrain previews are cut until bounded federal inputs have source URLs, licence statements, SHA-256 receipts and anonymous deployment bindings. The remaining work is tracked in [the source attestation issue](https://github.com/honua-io/honua-samples/issues/122).

## Published static exercise

The gallery opens a bundled snapshot without credentials. Real tsunami zone geography, school anchors and roads are separated from fictional shelter activation, occupancy and closure records. `public/data/sources.json` records source URLs, licences, input checksums and limitations. The approved school/road display inputs did not record their original retrieval dates; this snapshot makes no freshness claim. Nine school anchors produce nine fictional shelter records; these are not designated shelters. The tsunami import receipt is retained alongside the snapshot. Query parameters still connect approved live layer receipts for the SDK walkthrough; only that mode checks the server every 60 seconds.
