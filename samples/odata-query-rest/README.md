# Read spatial features with OData v4

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
The OData requests below demonstrate a protocol-specific integration rather than the native application path.

Discover one public layer and read three features through OData with plain
`fetch()`. No account or SDK is required.

## Run

```bash
node src/run.mjs
```

The script reads `/odata/Layers?$top=1`, follows the returned layer ID, and
requests `/odata/Layers(id)/Features?$top=3&$count=true`. It succeeds only when
the response contains spatial features and a server-side total count.

Set `HONUA_BASE_URL` to point the same code at your own anonymous OData surface.
