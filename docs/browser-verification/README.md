# Browser sample verification (Playwright)

Every sample with `entrypoint.type: "browser"` is proven by Playwright specs that drive the sample in a real
browser against a composed Honua server. The specs are the sample's pass/fail signal in
[`run-samples.yml`](../../.github/workflows/run-samples.yml); a failed spec fails the workflow.

| Sample | What the spec proves |
| --- | --- |
| [`browser-featureserver-query`](../../samples/browser-featureserver-query) | The page queries a FeatureServer seeded from the fixture and renders the fixture's ids, names and rings; a missing service, an invalid `where` and a service that refuses anonymous reads each show the server's error (`FAIL: Not Found`, `FAIL: Bad Request`, `FAIL: Unauthorized`). Because the manifest is `public-live`, the page's defaults are also proven against the public deployment (`HONUA_SAMPLE_TARGET_BASE_URL`, from `HONUA_PUBLIC_BASE_URL`). |
| [`create-honua-app-vanilla-ts`](../../samples/create-honua-app-vanilla-ts) | The `vanilla-ts` starter, scaffolded from the published `create-honua-app` at the version the sample pins, installs from the npm registry, typechecks, builds, connects to the seeded layer, reports the fixture's feature count, and draws every fixture polygon where the fixture puts it. Pointed at a layer that refuses anonymous callers, it stops with `The workflow stopped: HTTP 499: Unauthorized` and draws nothing. |
| [`create-honua-app-react-ts`](../../samples/create-honua-app-react-ts) | The same for the `react-ts` starter (which shows no feature count, so the query answer and map pixels carry the oracle). |

## How it works

- `playwright.config.ts` finds `samples/*/verify/*.spec.mjs`. It runs one worker, `retries: 0`, keeps traces and
  screenshots only for failed specs, and runs Chromium only unless `HONUA_PW_ALL_BROWSERS=1`.
- [`scripts/browser-verification/harness.mjs`](../../scripts/browser-verification/harness.mjs) seeds
  [`fixtures/honolulu-operations-areas.geojson`](../../scripts/browser-verification/fixtures/honolulu-operations-areas.geojson)
  into the composed server through the admin API (import, publish, enable FeatureServer, open anonymous reads where
  the spec needs them) under unique names, and waits until the layer serves the fixture. Every assertion is computed
  from that fixture, not from the server's answer. The base URL and admin API key come from the runner's environment
  (`HONUA_BASE_URL`, `HONUA_ADMIN_API_KEY`); the pages themselves never see the admin key. The runner also passes
  `HONUA_SAMPLE_TARGET_BASE_URL` and `HONUA_SAMPLE_DATA_MODE`: for a `public-live` manifest the target is the public
  deployment, and the sample's specs must prove the page there too.
- Pages are served from `http://localhost:3000`, the one origin `docker/compose.yml` allows through CORS. Static
  samples use the repo's small static server; the create-honua-app samples use `vite preview` on the built app.
- create-honua-app samples carry a `package.json` and `package-lock.json` that pin `create-honua-app` exactly. The
  harness runs `npm ci` (so the registry integrity is enforced), scaffolds `app/` with that published CLI, installs
  the generated app from the registry, runs its `typecheck`, and builds it once per endpoint (`VITE_HONUA_ENDPOINT`
  is baked in at build time). The resolved `create-honua-app`, `@honua/sdk-js` and `maplibre-gl` versions,
  tarball URLs and integrity hashes are attached to the report as `published-packages.json`.
- The map oracle projects each fixture polygon's interior point onto the map with the template's own initial view
  (read from the scaffolded source), then reads the rendered pixels: each polygon must differ from the basemap
  background and share one fill colour, and a control point outside every polygon must show the background. Waits
  are on DOM states, network answers and rendered pixels, never fixed sleeps.

## Evidence

`scripts/run-samples.mjs` runs each browser sample's specs once and records the sample in
`results/run-results.v1.json` like every other sample. For each browser sample it also writes, under
`results/browser-verification/`:

- `<id>.run-results.v1.json`: the runner's `run-results.v1` envelope
  ([schema](../../schemas/run-results.v1.schema.json)) holding just that sample;
- `<id>.specs.json`: one entry per spec (title, project, outcome, duration, first error line);
- `<id>.playwright.json`: the raw Playwright JSON report, including the attachments.

The honua-release client-regression packets (`27-release-client-regression-*`) that will define the
installed-client evidence shape have not landed, so these files keep the runner's current shape.

A sample passes only when Playwright exits 0, at least one spec ran, and every spec passed. A skipped spec (for
example after a failed `beforeAll`) or a browser sample with no `verify/` spec is a failure.

## Run locally

```bash
npm ci
npx playwright install chromium

# Compose the server; pin the image to the release candidate digest you want to prove.
HONUA_SERVER_IMAGE=ghcr.io/honua-io/honua-server@sha256:<digest> docker compose -f docker/compose.yml up -d

export HONUA_BASE_URL=http://localhost:8080
export HONUA_ADMIN_API_KEY=quickstart-admin-password

# All browser samples, or one, exactly as CI runs them:
npx playwright test
npx playwright test samples/create-honua-app-react-ts

# Or through the runner, which also writes the evidence files:
node scripts/run-samples.mjs
```

Firefox and WebKit are not run in CI. To run them locally:

```bash
npx playwright install firefox webkit
HONUA_PW_ALL_BROWSERS=1 npx playwright test --project=firefox --project=webkit
```

If the composed server is on another port (`HONUA_HTTP_PORT`), point `HONUA_BASE_URL` at it; the browser origin must
stay `http://localhost:3000` because of the compose CORS setting. Failed specs leave a trace under
`results/browser-verification/artifacts/`; open it with `npx playwright show-trace <trace.zip>`.

## Adding a browser sample

1. Add `samples/<id>/sample.json` with `entrypoint.type: "browser"` and `entrypoint.command` set to the HTML entry the
   browser opens.
2. Add `samples/<id>/verify/<id>.spec.mjs`. Seed what the page needs with `seedFeatureService`, assert on values
   derived from the fixture, and cover the documented failure messages as well as the happy path.
3. If the sample or the SDK fails for a product reason, open an issue in the owning repo with the trace attached and
   set the sample's `status` to `draft` with the issue linked in its README. Never delete or skip the spec.
