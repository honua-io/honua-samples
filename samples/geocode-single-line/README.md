# Geocode one address

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
The geocoding endpoint check below is a bounded protocol example; it does not qualify native feature queries or edits.

Send one anonymous request to Honua's GeoServices REST GeocodeServer and print
the best candidate.

## Run

```bash
node src/run.mjs
```

Expected result:

```text
PASS: "380 New York St, Redlands, CA" -> "..." (..., ...), score ...
```

Set `HONUA_SAMPLE_ADDRESS` to try another address or `HONUA_BASE_URL` to use
another Honua server. The public demo geocoder depends on its configured
upstream geocoding provider and internet access.
