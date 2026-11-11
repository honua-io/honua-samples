# Maui 311 exercise dashboard

Browse fictional requests on real Maui road geometry. Status, type, fictional district
and request/crew search filter the map, metrics, 12-week event counts and exports together.
Select a request to inspect its timeline and assigned exercise crew. Metrics use the
recorded scenario date; they do not imply current county activity.

The dashboard reads an anonymously published exercise layer through the published
JavaScript SDK. It checks every page before showing totals and rejects missing demo
labels, inconsistent timelines, duplicate IDs and changing counts. CSV and GeoJSON
exports retain the exercise labels and omit fields outside the documented contract.

After loading, **Check OGC feed** verifies every page of the same layer's anonymous
OGC API Features collection against the complete dashboard snapshot. Collection
and paginated GeoJSON links appear only after counts, record values, geometry and
exercise labels agree. Dashboard filters affect downloads; the OGC collection
contains all requests. Refresh clears verification. A failed feed check can be
retried without discarding the dashboard. Publish `OgcFeatures` alongside
`FeatureServer` when configuring the layer.

Build and run the repository gallery (shared fonts, theme and logos are gallery assets):

```sh
npm ci
node scripts/build-gallery.mjs --check
npm ci --prefix samples/maui-311
npm run build --prefix samples/maui-311
mkdir -p site/maui-311/app
cp -R samples/maui-311/dist/. site/maui-311/app/
python3 -m http.server 3000 --directory site
```

Open `/maui-311/app/?service=YOUR_SERVICE&layer=0` on that local server. The default
API is `https://demo.honua.io`; a disposable local API can be selected with
`&baseUrl=http://localhost:8080`. Use the service and layer from the import receipt.
This explicit local staging step is needed while the full journey remains withheld
from the public portfolio. No API key belongs in the URL or browser. Without a binding the page shows an honest
unconfigured state. See [the import recipe](../../docs/state-local-data.md) to create
an exercise layer; the public deployment is not activated by this sample.

**DEMO DATA:** requests, districts and crews are fictional. Geometry is real public
data, credited in the recipe. This app is not a county reporting service. No photos,
notes, reporter contacts or operational feeds are included. Districts are exercise
areas, not council wards. The map draws request geometry on a plain background and
makes no external basemap requests.

The shared public OGC deployment, released Studio app, Console walkthrough and
executed stock-client MCP question remain separate completion gates. This sample
does not expose an Open311 endpoint or claim those gates have passed.

## Published SDK queries

Generate a [receipt-bound stock MCP client setup and question](../../docs/state-local-mcp.md)
for the agent moment. Setup generation does not mark the stock-client journey complete.

Query `maui-demo-requests` with the same filter in JavaScript, Python and .NET.
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
node scripts/state-local/sdk/query.mjs 311
artifacts/state-local/venv/bin/python scripts/state-local/sdk/query.py 311
dotnet run --project scripts/state-local/sdk/StateLocal.csproj -- 311
```

Default filter: `record_type = 'service_request' AND status <> 'exercise_closed'`.

**DEMO DATA:** operational records are fictional exercises over real public geometry. They are not actual requests, work orders, closures or designated shelters. The snippets reject records missing their exercise markers.

## Real-server contract check

```sh
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=your-local-admin-key \
node scripts/state-local/sdk/verify.mjs 311
```

This command **writes synthetic test data** to the disposable server, then runs all
three published SDKs anonymously. Never point it at the shared demo or a production
server. CI checks the filter, returned feature IDs, geometry and exercise labels.
Its `SR-01` test name identifies the SDK query portion only; it does
not claim the full UI requirement passes. Dependencies must be installed as above;
set `HONUA_SAMPLE_PYTHON` to the virtual environment's Python executable.

[Import data and record provenance](../../docs/state-local-data.md).

## Dashboard verification

Install the SDK dependencies above, start the disposable PostGIS-only server from
`docker/compose.yml`, then run:

```sh
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=your-local-admin-key \
HONUA_SAMPLE_PYTHON="$PWD/artifacts/state-local/venv/bin/python" \
npx playwright test samples/maui-311/verify/dashboard.spec.mjs
```

This imports test-only requests through Honua's import flow. It checks pagination
beyond one server page, computed totals, filters, request selection, labeled exports,
rejection of unsafe data, retry, mobile layout and theme switching. The same check
runs in the capability-keyed samples CI. The test also runs the three SDK contracts.
