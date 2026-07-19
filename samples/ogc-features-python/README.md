# ogc-features-python

Pure-stdlib Python sample: no SDK, no third-party HTTP client -- just
`urllib.request`. Demonstrates OGC API Features from a plain Python client,
the way an analyst scripting against Honua would actually write it.

## What it does

1. Uploads a 5-point GeoJSON file (`POST /api/v1/admin/import/upload`),
   hand-building the `multipart/form-data` body since `urllib` has no
   built-in multipart encoder.
2. Registers the compose Postgres as a named connection (`local`).
3. Publishes the imported table as a layer under its own service
   (`ogc-features-python-sample`) -- self-contained, so this sample doesn't
   depend on any other sample having run first.
4. Enables the `OgcFeatures` protocol on that service and opens anonymous
   reads, so the walk below also proves the no-API-key path works.
5. Walks the OGC API Features surface:
   - `GET /ogc/features` (landing page) -- asserts a title and a
     `conformance` link are present.
   - `GET /ogc/features/conformance` -- asserts the OGC API Features core
     conformance class is declared.
   - `GET /ogc/features/collections` -- asserts the published layer appears.
   - `GET /ogc/features/collections/{id}/items?limit=2` -- pages through
     `rel=next` links until exhausted, asserting the walk spans more than
     one page and that all 5 features round-trip with geometry and name
     intact.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#local-dev)):

```bash
python3 samples/ogc-features-python/src/run.py
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `ogc-features-python-sample` | Service name this sample publishes under. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_ogcfeat_<timestamp>` | Table name for the imported data. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed). Requires only the Python 3 standard library.
