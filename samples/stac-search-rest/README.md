# Discover a public STAC catalog

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
This STAC example discovers assets; use the native file path for their public, read-heavy content.

Read the STAC root and collection list, then run one bounded item search and
report what came back.

## Run

```bash
node src/run.mjs
```

The script reads `/stac` and `/stac/collections`, checks that every collection
links to its items, then sends `GET /stac/search?limit=1` and succeeds only when
the result is a GeoJSON `FeatureCollection` whose first item has a geometry.
Against the public demo it prints the collection titles and the ID and
collection of the item it found.

Set `HONUA_BASE_URL` to inspect another STAC deployment.
