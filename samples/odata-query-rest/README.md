# Read spatial features with OData v4

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
