# stac-search-rest

Plain-REST sample: no SDK, just `fetch()`. Demonstrates Honua's STAC API
(`/stac/*`) discovery-and-items walk.

## What it does

1. Uploads a 4-point GeoJSON file (`POST /api/v1/admin/import/upload`).
2. Registers the compose Postgres as a named connection (`local`).
3. Publishes the imported table as a layer under its own service
   (`stac-search-rest-sample`) -- self-contained, so this sample doesn't
   depend on any other sample having run first.
4. Enables the `Stac` protocol on that service and opens anonymous reads.
5. Walks `GET /stac` (catalog landing) and `GET /stac/conformance`,
   asserting the STAC core conformance class is declared.
6. Requests `GET /stac/collections/{id}/items` with a bbox covering 3 of
   the 4 imported points ("Oakland City Hall" sits outside it) and asserts
   exactly the in-bbox points come back, each with real `Point` geometry;
   then fetches one item individually by id and asserts its geometry too.

### Known gap (not a bug in this sample)

`GET /stac/collections` (the collection *list*) and `GET`/`POST
/stac/search` both require a metadata-v2 `StacCollection` publication
record. The standard `POST /api/v1/admin/connections/{name}/layers` publish
flow this sample (and `hello-featureserver-rest`) uses only creates an
`EsriFeatureLayer` publication -- there is currently no admin-facing path
that also creates the `StacCollection` one. That means a freshly
self-published vector layer like this sample's items endpoint works fine
(no metadata-v2 gate on the item route), but won't show up in the
collection list or cross-collection search yet. The sample calls
`/stac/collections` and logs whether the layer is visible there (not
asserted, since it legitimately isn't today) rather than silently skipping
that part of the documented surface.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#local-dev)):

```bash
node samples/stac-search-rest/src/run.mjs
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `stac-search-rest-sample` | Service name this sample publishes under. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_stac_<timestamp>` | Table name for the imported data. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed).
