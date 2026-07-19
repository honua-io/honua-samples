# browser-featureserver-query

Plain-browser walkthrough of the import -> publish -> query loop, driven
entirely by browser-side `fetch()`/DOM from a static HTML page -- no SDK, no
Node. It's the browser-lane twin of
[`hello-featureserver-rest`](../hello-featureserver-rest/README.md), added to
prove `scripts/lib/browser-lane.mjs`'s headless-browser runner lane
(honua-io/honua-samples#2).

## What it does

Same five steps as `hello-featureserver-rest`, run from `src/index.html`'s
inline `<script type="module">` instead of a Node script:

1. Uploads a tiny 3-point GeoJSON file.
2. Registers the compose Postgres as a named connection (`local-browser` --
   deliberately distinct from `hello-featureserver-rest`'s `local`, so the two
   samples never share connection/layer state even when run in the same CI
   job).
3. Publishes the imported table as a FeatureServer layer (`browser-hello-points`).
4. Allows anonymous reads on the resulting service.
5. Queries the layer back over the Esri-compatible GeoServices REST
   FeatureServer and asserts all three features round-tripped.

## Success signal

Per `schemas/sample.v1.schema.json`'s `entrypoint.command` doc for type
`"browser"`: once finished, the script sets
`document.body.dataset.sampleStatus` to `"pass"` or `"fail"` (with an
additional `data-sample-error` attribute on failure). The runner
(`scripts/lib/browser-lane.mjs`) polls for the `[data-sample-status]`
selector and reads that attribute -- nothing else on the page matters to it.

## Run it locally

Against a running compose stack (`docker compose -f docker/compose.yml up
-d`), either:

- Let the runner drive it headlessly: `node scripts/run-samples.mjs` (starts
  the static server + Playwright automatically -- see the top-level
  [README](../../README.md#browser-lane)).
- Or open `src/index.html` directly in a real browser -- it defaults to
  `http://localhost:8080` / `quickstart-admin-password`, the same compose
  defaults `hello-featureserver-rest` uses. `?baseUrl=`/`?apiKey=` query
  params override both (this is how the runner passes
  `HONUA_BASE_URL`/`HONUA_ADMIN_API_KEY` through, since a static page has no
  `process.env`).
