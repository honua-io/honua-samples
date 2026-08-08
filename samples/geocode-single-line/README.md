# Geocode one address

Send one anonymous request to Honua's Esri-compatible GeocodeServer and print
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
