# Maui County public fire-station map

The emergency-management journey end to end on the default PostGIS-only server:
real open data in, a released map out that residents open without signing in.

```sh
export HONUA_BASE_URL=http://localhost:8080
export HONUA_ADMIN_API_KEY=your-local-admin-key
node samples/maui-public-map/src/run.mjs
```

The sample:

1. downloads the Maui fire-station snapshot with its terms, licence and checksum
   (the same source as [the data pipeline](../maui-data-pipeline/README.md));
2. imports it into the Emergency Management folder and activates the reviewed layer;
3. creates a Studio map draft bound to that layer, validates it and seals an immutable version;
4. checks that the unpublished map is not readable and that anonymous callers cannot request publication;
5. finds the map source and publishes the version publicly through the Studio MCP tools
   (`honua_list_layers`, `honua_studio_propose_publication`) as an administrator, then reads the
   released map and its source catalog anonymously and checks the public feature count matches
   the snapshot.

It writes a receipt (`HONUA_SAMPLE_RECEIPT_OUT`, default under ignored `artifacts/state-local/ci/`).
After restarting the server, prove the publication is durable:

```sh
HONUA_SAMPLE_VERIFY_RECEIPT=path/to/public-map.json node samples/maui-public-map/src/run.mjs
```

An administrator publishes directly. If the server holds the publication for approval instead, the
sample stops with the proposal id: approve it in Console, then rerun with the receipt.

Each run keeps a new map and layer for Console inspection. Do not run it against a shared
deployment without its operator's approval. Data sources and licences:
[state-local data](../../docs/state-local-data.md).
