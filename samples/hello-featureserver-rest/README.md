# Query a public FeatureServer

Read three real Maui building features with plain `fetch()`. No account, API
key, database, import, or SDK is required.

## Run

```bash
node src/run.mjs
```

Expected result:

```text
PASS: maui-buildings/FeatureServer/13 returned 3 feature(s) with geometry
```

## What the code does

1. Reads the service metadata and discovers its first layer ID.
2. Sends one FeatureServer query for three records.
3. Checks that real geometries came back.

Set `HONUA_BASE_URL` or `HONUA_SAMPLE_SERVICE` to point the same code at your
own anonymous service.
