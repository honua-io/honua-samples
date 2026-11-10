# Maui property and planning: published SDK queries

Query `maui-zoning` with the same filter in JavaScript, Python and .NET.
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
node scripts/state-local/sdk/query.mjs property
artifacts/state-local/venv/bin/python scripts/state-local/sdk/query.py property
dotnet run --project scripts/state-local/sdk/StateLocal.csproj -- property
```

Default filter: `zone_code IS NOT NULL`.

County zoning is one regulatory layer. These results do not determine development rights. See the [property viewer](../county-parcel-viewer/) for the land-use stack and source limitations. No permit records are copied; use the County permit search with the source TMK.

## Real-server contract check

```sh
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=your-local-admin-key \
node scripts/state-local/sdk/verify.mjs property
```

This command **writes synthetic test data** to the disposable server, then runs all
three published SDKs anonymously. Never point it at the shared demo or a production
server. CI checks the filter, returned feature IDs, geometry and exercise labels.
Its `PRM-08` test name identifies the SDK query portion only; it does
not claim the full UI requirement passes. Dependencies must be installed as above;
set `HONUA_SAMPLE_PYTHON` to the virtual environment's Python executable.

[Import data and record provenance](../../docs/state-local-data.md).
