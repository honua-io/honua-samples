# Discover a public STAC catalog

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
This STAC example discovers assets; use the native file path for their public, read-heavy content.

Read the STAC root and collection list, then report the collections that can be
explored further.

## Run

```bash
node src/run.mjs
```

This sample intentionally stops at collection discovery. On 2026-08-08 the
public demo's collection list was healthy while at least one collection-items
route returned HTTP 500. Item search should not be presented as a working
starter until that deployed path has a current passing receipt.

Set `HONUA_BASE_URL` to inspect another STAC deployment.
