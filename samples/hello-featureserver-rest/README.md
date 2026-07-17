# hello-featureserver-rest

Plain-REST sample: no SDK, just `fetch()`. Demonstrates the full
import -> publish -> query loop against a composed Honua Server, then asserts
the round trip instead of just eyeballing curl output.

## What it does

1. Uploads a tiny 3-point GeoJSON file (`POST /api/v1/admin/import/upload`).
2. Registers the compose Postgres as a named connection (`local`).
3. Publishes the imported table as a FeatureServer layer.
4. Allows anonymous reads on the `default` service.
5. Queries the layer back via the Esri-compatible GeoServices REST
   FeatureServer (`GET /rest/services/default/FeatureServer/{layerId}/query`)
   and asserts all three features and their `name` attributes came back.

This mirrors honua-server's own
[`docs/get-started/first-dataset.md`](https://github.com/honua-io/honua-server/blob/trunk/docs/get-started/first-dataset.md)
walkthrough, scripted and asserted.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#running-the-headless-sample-runner-locally)):

```bash
node samples/hello-featureserver-rest/src/run.mjs
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls; must match the server's `HONUA_ADMIN_PASSWORD`. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `default` | Service name whose access policy gets opened up for anonymous reads. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_hello_<timestamp>` | Table name for the imported data; timestamped by default so repeat runs against a long-lived server don't collide. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed). Nothing is printed that isn't either progress or the
final PASS/FAIL line, so it's safe to run headless in CI.
