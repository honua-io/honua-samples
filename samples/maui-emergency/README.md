# Maui emergency preparedness exercise

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
verified stock-client MCP execution, evacuation zones, routing, live alerts,
private EOC roles and approved situational reports remain separate delivery gates.
The page includes the realistic MCP question; displaying that question is not
evidence that an agent executed it.

## Published SDK queries

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
Its `EM-01` test name identifies the SDK query portion only; it does
not claim the full UI requirement passes. Dependencies must be installed as above;
set `HONUA_SAMPLE_PYTHON` to the virtual environment's Python executable.

[Import data and record provenance](../../docs/state-local-data.md).
