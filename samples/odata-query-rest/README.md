# odata-query-rest

Plain-REST sample: no SDK, just `fetch()`. Demonstrates Honua's OData v4
service (`/odata/*`) the way a BI-tool integration (Power BI, Excel, a
custom OData client) would actually query it.

## What it does

1. Uploads a 4-point GeoJSON file (`POST /api/v1/admin/import/upload`).
2. Registers the compose Postgres as a named connection (`local`).
3. Publishes the imported table as a layer under its own service
   (`odata-query-rest-sample`) -- self-contained, so this sample doesn't
   depend on any other sample having run first.
4. Enables the `OData` protocol on that service and opens anonymous reads.
5. Walks `GET /odata` (service document) and `GET /odata/$metadata`,
   asserting the `Layers`/`Features` entity sets and the `Feature` entity
   type are declared.
6. Reads back the full, unfiltered feature set
   (`GET /odata/Layers({layerId})/Features?$count=true`) to learn the real
   server-assigned `ObjectId` values -- these are a global sequence across
   every layer ever published on the server, never reset per layer, so a
   hardcoded filter threshold would be fragile.
7. Queries `$filter=ObjectId gt {median}&$count=true` and asserts the
   filtered `@odata.count` is exactly the expected remainder, and that
   every returned feature's `ObjectId` really is above the threshold --
   proof `$filter` is real server-side filtering, not an echo of the
   unfiltered count.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#local-dev)):

```bash
node samples/odata-query-rest/src/run.mjs
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `odata-query-rest-sample` | Service name this sample publishes under. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_odata_<timestamp>` | Table name for the imported data. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed).
