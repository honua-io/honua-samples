# wms-getmap-check

Zero-dependency Node.js sample using the platform `fetch()` API. Demonstrates
classic WMS `GetCapabilities`/`GetMap` with assertions suitable for a headless
smoke test.

## What it does

1. Uploads a 3-point GeoJSON file (`POST /api/v1/admin/import/upload`).
2. Registers the compose Postgres as a named connection (`local`).
3. Publishes the imported table as a layer under its own service
   (`wms-getmap-check-sample`) -- self-contained, so this sample doesn't
   depend on any other sample having run first.
4. Enables the `Wms` protocol on that service and opens anonymous reads.
5. Requests `GetCapabilities` and asserts the published layer's `<Name>`
   appears in the response XML.
6. Requests `GetMap` at an explicit, non-square 317x241 size and asserts:
   - the response's `Content-Type` header is `image/png`,
   - the response body starts with the real PNG magic bytes (not just a
     200 with an empty or error body wearing the right `Content-Type`),
   - the PNG's own IHDR chunk encodes width/height matching what was
     requested -- proof the server actually rendered the requested
     dimensions, not just returned *some* PNG.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#local-dev)):

```bash
node samples/wms-getmap-check/src/run.mjs
```

Requires Node.js 22 or later; there are no npm dependencies.

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `wms-getmap-check-sample` | Service name this sample publishes under. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_wms_<timestamp>` | Table name for the imported data. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed).
