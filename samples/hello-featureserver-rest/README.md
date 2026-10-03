# Query a public FeatureServer

Read three real Maui building features with plain `fetch()`. No account, API
key, database, import, or SDK is required.

## Run

You need Node.js 20+. The script reads two optional variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `HONUA_BASE_URL` | `https://demo.honua.io` | Honua server to query. |
| `HONUA_SAMPLE_SERVICE` | `maui-buildings` | An anonymous FeatureServer service on that server with at least three features. The script reads its first layer. |

Leave both unset to query the public demo, or export both to point the same
code at your own server, for example:

```bash
export HONUA_BASE_URL=http://localhost:8080
export HONUA_SAMPLE_SERVICE=<your-feature-service>
```

Then run:

```bash
node src/run.mjs
```

Expected result, with your service name and its first layer ID:

```text
PASS: .../FeatureServer/... returned 3 feature(s) with geometry
```

Against the public demo it prints
`PASS: maui-buildings/FeatureServer/13 returned 3 feature(s) with geometry`.

## What the code does

1. Reads the service metadata and discovers its first layer ID.
2. Sends one FeatureServer query for three records.
3. Checks that real geometries came back.
