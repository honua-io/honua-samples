# Static demo publication

The Pages build publishes `/state-local/property/`, `/state-local/311/` and
`/state-local/public-works/` from the existing sample applications. They read
checksum-pinned WGS84 GeoJSON without a live Honua API. API feeds, address search
and field editing are labelled as coming later. Standard sample builds continue
to use the published SDK and live service bindings.

`config/state-local-display.v1.json` pins the public snapshot archive and its
SHA-256. The archive contains display GeoJSON and a source manifest, without raw
responses or private execution evidence. The manifest records each source's
licence, attribution, checksum, count and retrieval date. Fictional operational
records retain their DEMO DATA labels, anchor checksum and exercise date.
Planning geometry is generalized for display and is not a survey boundary.

Prepare a replacement from verified pipeline receipts:

```sh
node scripts/state-local/pack-display-snapshots.mjs \
  /path/to/verified/planning /path/to/verified/roads artifacts/display-publication
```

Publish the resulting `maui-display.tar.gz` as a public repository release asset,
then update the lock's URL, archive checksum and publication date. No large data
or execution evidence belongs in git.

Build and check the published routes:

```sh
node scripts/state-local/build-display-site.mjs
node scripts/build-gallery.mjs --check
npm ci
npx playwright install chromium
node scripts/smoke-state-local-display.mjs
```

## Server endpoint

The journeys read live tiles and services from one Honua server, `https://demo.honua.io`
by default (`shared/state-local/server.mjs`). Set `VITE_STATE_LOCAL_SERVER` to a bare
origin when building to point every journey, the sample bindings and the SDK Explorer at
another server:

```sh
VITE_STATE_LOCAL_SERVER=https://rehearsal.example.org node scripts/state-local/build-display-site.mjs
VITE_STATE_LOCAL_SERVER=https://rehearsal.example.org node scripts/build-gallery.mjs
```

Serve the built `site/` and run the six journeys against that server. The project is
skipped unless both variables are set:

```sh
VITE_STATE_LOCAL_SERVER=https://rehearsal.example.org STATE_LOCAL_SITE_URL=http://localhost:8080 \
  npx playwright test --project state-local-journeys
```
