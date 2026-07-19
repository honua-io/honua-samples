# honua-samples

**Runnable samples as executable evidence.**

Cross-SDK, cross-protocol samples for [Honua Server](https://github.com/honua-io/honua-server) — each one declared against the canonical capability vocabulary and executed headless in CI against a real composed server. A green sample run is a receipt, not a promise: results feed the [honua-evidence](https://github.com/honua-io/honua-evidence) capability matrix with the same standing as tests.

## Layout

```
samples/<sample-id>/
  sample.json      manifest: id, title, capability keys, SDKs used, edition required, protocols
  README.md        what it shows, how to run it locally
  src/             the sample itself (JS/TS, Python, .NET, or raw REST)
```

Rules:

- **Manifests are validated in CI** against the canonical capability key list published by honua-server — unknown keys fail the build.
- **Every sample runs headless in CI** against a composed Honua server (Community edition unless the manifest requires higher); run results are published as evidence.
- **SDKs are consumed as published packages only** (npm/NuGet/PyPI) — no source copies, no sibling project references.
- Samples that demonstrate Esri-client compatibility point at the same endpoints ArcGIS clients use, unchanged.
- **Capabilities are never padded with zero-sample entries** in the coverage snapshot (below) — a capability with no covering sample is simply absent, so the honua-evidence matrix renders that honestly as a gap.

## Manifest schema

Every `samples/<sample-id>/sample.json` is validated against
[`schemas/sample.v1.schema.json`](schemas/sample.v1.schema.json). Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kebab-case; must match the containing directory name. |
| `title` | string | Short human-readable title. |
| `description` | string | One or two sentences. |
| `capabilities` | string[] | Dot-namespaced keys (e.g. `serve.feature-service`), min 1. Every key must exist in the canonical capability key list (see below). |
| `sdks` | string[] | `js` \| `python` \| `dotnet` \| `rest`, min 1. |
| `protocols` | string[] | Wire protocols exercised, min 1. |
| `edition` | string | `community` \| `pro` \| `enterprise`; defaults to `community`. |
| `entrypoint` | object | `{ "type": "node" \| "python" \| "dotnet" \| "script", "command": "..." }` -- how the headless runner executes the sample. |
| `status` | string | `active` (executed by the runner) or `draft` (validated only). |

### Capability key list

Manifests are validated against a canonical capability key list. The real
list is published by [honua-server#2893](https://github.com/honua-io/honua-server/issues/2893)
(`capability-keys.v1.json`) and is not published yet as of this writing, so
CI validates against a pinned fixture instead:
[`schemas/fixtures/capability-keys.fixture.json`](schemas/fixtures/capability-keys.fixture.json)
(~15 plausible keys, loudly commented as a placeholder).

`scripts/validate-manifests.mjs` reads the `KEY_LIST_URL` environment
variable first; when it is set to an `http(s)` URL, that is fetched instead
of the fixture. This is a one-line swap in
[`.github/workflows/validate.yml`](.github/workflows/validate.yml) (set the
`KEY_LIST_URL` repo/org variable) once the real artifact is published -- no
script changes required. The same loader (`scripts/lib/capability-keys.mjs`)
backs `scripts/generate-samples-coverage.mjs` below.

## Samples coverage snapshot

`scripts/generate-samples-coverage.mjs` joins every `samples/<id>/sample.json`
manifest with the latest
[`results/run-results.v1.json`](schemas/run-results.v1.schema.json) envelope
(written by `scripts/run-samples.mjs`) into
[`samples-coverage.v1.json`](schemas/samples-coverage.v1.schema.json): the
producer snapshot [honua-evidence](https://github.com/honua-io/honua-evidence)'s
capability matrix ingests, keyed by capability key → the sample(s) that
demonstrate it.

```json
{
  "schemaVersion": "samples-coverage.v1",
  "generatedAt": "2026-07-17T20:17:30.531Z",
  "capabilities": {
    "import.file": [
      {
        "id": "hello-featureserver-rest",
        "title": "Hello FeatureServer (plain REST)",
        "url": "https://samples.honua.io/hello-featureserver-rest",
        "sdks": ["rest"],
        "edition": "community",
        "lastRun": { "outcome": "pass", "serverVersion": "1.2.3", "at": "2026-07-17T05:12:47.127Z" }
      }
    ]
  }
}
```

Rules:

- **Only capability keys with ≥1 covering sample appear.** Nothing is padded
  with an empty array — a missing key means zero coverage, not a schema quirk.
- **`lastRun` is present only when the sample has actually been executed** —
  i.e. it's `status: "active"` and has a matching entry in the latest
  `run-results.v1.json`. Draft samples, or active samples that haven't run
  yet, simply omit it.
- **Capability keys are validated the same way `validate-manifests.mjs` does**
  (`KEY_LIST_URL` env var, falling back to the pinned fixture) — this is
  defense in depth so a typo'd key can never reach the published snapshot,
  even on a run where `validate.yml` hasn't gated the manifest first (e.g. the
  nightly `run-samples` schedule). Unknown keys are dropped with a warning,
  not a hard failure, since `validate-manifests.mjs` is the authoritative gate
  for that.
- The generator self-checks its own output against
  [`schemas/samples-coverage.v1.schema.json`](schemas/samples-coverage.v1.schema.json)
  before writing it.

Published as a CI artifact (`samples-coverage`) by the `run-samples` workflow
on every trunk push, PR touching relevant paths, and nightly run — see
[`.github/workflows/run-samples.yml`](.github/workflows/run-samples.yml).
**Deferred:** honua-evidence dispatch/pull integration
([honua-io/honua-evidence#3](https://github.com/honua-io/honua-evidence/issues/3))
— that repo's ingest pipeline doesn't exist yet, so for now the artifact is
published here for honua-evidence to pull once its side lands.

### Generate it locally

```bash
node scripts/generate-samples-coverage.mjs
```

Reads `samples/*/sample.json` and `results/run-results.v1.json` by default,
writes `coverage/samples-coverage.v1.json` (gitignored, like `results/` — it's
a generated CI artifact, not a committed file). Override any of the three
with env vars for local testing without touching real files, e.g. against the
committed fabricated fixture:

```bash
RUN_RESULTS_PATH=schemas/fixtures/run-results.fixture.json \
OUT_PATH=/tmp/samples-coverage.v1.json \
node scripts/generate-samples-coverage.mjs
```

## Local dev

### Validate manifests

```bash
node scripts/validate-manifests.mjs
```

Exits non-zero with a per-file, per-error report on any schema violation,
directory-name/`id` mismatch, or unknown capability key. To see it catch a
deliberately broken manifest:

```bash
node scripts/validate-manifests.mjs schemas/fixtures/invalid-samples
```

### Run the headless sample runner locally

The runner (`scripts/run-samples.mjs`, scaffolded for
[honua-samples#2](https://github.com/honua-io/honua-samples/issues/2)) composes
honua-server + PostGIS, waits for `/healthz/ready`, executes every `active`
sample's `entrypoint.command`, and writes
[`results/run-results.v1.json`](schemas/run-results.v1.schema.json).

```bash
docker compose -f docker/compose.yml up -d
node scripts/run-samples.mjs
docker compose -f docker/compose.yml down -v
```

`docker/compose.yml` pulls the published `ghcr.io/honua-io/honua-server`
image (there is no versioned release yet, so it defaults to the
trunk-tracking tag -- override with `HONUA_SERVER_IMAGE=<image>:<tag>` to
pin something else). PostGIS auto-starts via `docker/init-db.sql` (a vendored
copy of honua-server's own init script); the server's readiness probe is
`GET /healthz/ready`.

## Gallery

Published at [samples.honua.io](https://samples.honua.io) -- **the single canonical Honua
sample gallery** (decided on [honua-io/honua-samples#3](https://github.com/honua-io/honua-samples/issues/3)).
Every deploy runs `node scripts/build-gallery.mjs`, which renders `site/` fresh
from **two inputs**:

1. **This repo's own samples** -- every `samples/<id>/sample.json` manifest,
   its `README.md`, and (when available) the matching entry in the latest
   `results/run-results.v1.json` for an honest run badge. A badge only ever
   says "runs green" when there's an actual passing run behind it; a `draft`
   sample or an `active` sample that hasn't run yet says so plainly instead.
2. **honua-sdk-js's sample catalog** -- fetched live from
   [`samples/catalog.v2.json`](https://raw.githubusercontent.com/honua-io/honua-sdk-js/trunk/samples/catalog.v2.json)
   (32 entries as of this writing). Nothing is vendored: every entry links out
   to its GitHub source (`sourcePath`) and docs (`docsPath`) in honua-sdk-js.
   Canonical `capabilityKeys` are usually already materialized on each entry
   ([honua-io/honua-sdk-js#635](https://github.com/honua-io/honua-sdk-js/issues/635));
   `scripts/lib/sdkjs-catalog.mjs` derives them from the entry's SDK-vocabulary
   `capabilities` tags via the committed crosswalk
   (`config/capability-crosswalk.v1.json` in honua-sdk-js) for any entry that
   doesn't carry the field yet.

Both inputs are validated against the same canonical capability key list
`scripts/validate-manifests.mjs` uses (`scripts/lib/capability-keys.mjs`) --
an sdk-js catalog entry referencing an unrecognized key fails the gallery
build exactly like an own-sample manifest would.

### Resilience: the sdk-js catalog fetch never breaks a deploy

If the live fetch of `catalog.v2.json` fails for any reason (network blip,
rate limit, upstream outage), `scripts/lib/sdkjs-catalog.mjs` falls back to
the committed offline snapshot,
[`config/sdkjs-catalog.snapshot.json`](config/sdkjs-catalog.snapshot.json).
When the live fetch *does* succeed, that snapshot is rewritten in place with
the fresh payload -- run `node scripts/build-gallery.mjs` locally and commit
the refreshed file occasionally so the offline fallback doesn't drift far
behind honua-sdk-js's trunk.

### Embeds: the actual running sample on the detail page

A detail page doesn't just describe an honua-sdk-js sample -- when a verified
build exists, it runs it live in an iframe (honua-io/honua-samples#11),
consuming honua-sdk-js's `sample-bundles-latest` GitHub Release
([honua-io/honua-sdk-js#642](https://github.com/honua-io/honua-sdk-js/issues/642)/[#648](https://github.com/honua-io/honua-sdk-js/issues/648)):
a `sample-bundles.v1.json` manifest (per-sample entrypoint, data mode,
`builtFrom` commit/version, and per-file `{path, bytes, sha256, integrity}`)
plus a `sample-bundles.tar.gz` of the built static files. This repo never
builds sdk-js source itself -- only the already-built, already-CI-verified
bundle is ever consumed.

**Inputs.** `scripts/lib/sample-bundles.mjs` fetches both assets from the
release (default: plain HTTPS `github.com/.../releases/download/...`, no
`gh` CLI or auth needed for a public release; override with
`SAMPLE_BUNDLES_MANIFEST_URL` / `SAMPLE_BUNDLES_TARBALL_URL`), extracts the
tarball, and stages verified files under a gitignored scratch root
(`.sample-bundles-staging/`) -- never inside `site/` directly, so
`scripts/build-gallery.mjs`'s own `site/sdk/` cleanup can never race the
staged files (they're copied in *after* that cleanup, per sample).

**Integrity.** Every file the manifest declares is re-hashed (SHA-256) against
the bytes actually extracted from the tarball before anything is staged. Any
mismatch -- wrong hash, wrong size, a file the manifest declares but the
tarball doesn't contain -- throws immediately and stages nothing for that
sample; this is a hard failure, not a warning, and is what fails the `pages.yml`
staging step. A card only ever gets an `<iframe>` when this build actually
staged sha256-verified files for it; the provenance line under the embed
("Built from honua-sdk-js @`<commit>`, fixture mode") is read straight from
the manifest's `builtFrom`, never guessed.

**Honesty rules.** An sdk-js entry the manifest doesn't cover (or that didn't
verify this run) renders an explicit "No runnable build published yet" panel
-- never a broken or empty iframe. This repo's own headless/CLI samples (like
`hello-featureserver-rest`) get a distinct "Headless sample -- run it locally"
panel with the run command and a link to CI run receipts, never a fake embed
either. A future browser-buildable sample in this repo without a staged
bundle of its own falls back to the same honest no-bundle panel.

**Fallback.** Bundle *bytes* are never committed (each release build is many
MB of JS/CSS/wasm, and honua-sdk-js's own CI already re-verifies them on every
publish). If the live fetch fails for any reason -- network blip, rate limit,
or the release not existing yet -- `scripts/lib/sample-bundles.mjs` falls back
to the committed manifest-only snapshot,
[`config/sample-bundles.snapshot.json`](config/sample-bundles.snapshot.json),
and the deploy degrades honestly: every sdk-js card shows the no-bundle panel,
and a visible warning appears in the page footer explaining why. Nothing ever
serves a stale or unverified embed. `pages.yml` runs staging as its own step
before the gallery build so an integrity failure is attributed clearly and
fails the deploy, while a fetch failure alone never does.

### The gallery index: categories, filters, and the `?caps=` contract

The index groups sample cards by capability **category** (from the canonical
key list's `category` field, e.g. "Serve", "Editing", "AI"); a card appears
under every category at least one of its capabilities belongs to. Cards with
no canonical capability yet (a handful of honua-sdk-js's client-only/dev-tool
entries -- React/Node/web-components framework bindings, migration tooling,
etc., per that repo's crosswalk) are listed honestly under "Other", never
silently dropped.

Filtering is dependency-free client-side JS
(`scripts/gallery-assets/gallery-filter.js`, copied into `site/assets/` at
build time) across four facets: **capability**, **SDK**, **edition**, and
**source repo**. With JavaScript absent, every card stays visible -- filtering
is progressive enhancement, not a requirement to browse the gallery.

`?caps=key1,key2` deep-links pre-check the matching capability filters (OR
semantics: a card matching *any* listed key is shown) and interoperate with
[honua.io/capabilities.html](https://honua.io/capabilities.html)'s own
`?caps=` filter and share-link picker -- a link generated by that page, or by
[honua-esri-assess](https://github.com/honua-io/honua-esri-assess)'s
migration footprint scanner, lands here pre-filtered to the matching samples.

### Validate it locally

```bash
node scripts/build-gallery.mjs          # builds site/ (index + one page per sample/entry);
                                         # also fetches + integrity-verifies + stages sdk-js
                                         # sample bundles inline (see the Embeds section above)
node scripts/build-gallery.mjs --check  # same build, but exits non-zero on any
                                         # cross-repo/data problem (unknown
                                         # capability key, missing sourcePath, ...) --
                                         # this is what validate.yml's
                                         # gallery-build-check job runs on every PR
node scripts/lib/sample-bundles.mjs     # staging only, standalone (what pages.yml's
                                         # dedicated staging step runs) -- exits 1 on an
                                         # integrity mismatch, 0 (with a warning) on a
                                         # plain fetch failure
```

`site/*.html` and `site/{assets,sdk,<sample-id>}/` are build output
(gitignored, like `results/` and `coverage/`) -- only `site/CNAME` and
`site/.nojekyll` are committed.

## Status

Bootstrap. Coordination: [honua-server#2892](https://github.com/honua-io/honua-server/issues/2892).
Manifest schema + validation CI: [#1](https://github.com/honua-io/honua-samples/issues/1).
Headless runner: [#2](https://github.com/honua-io/honua-samples/issues/2) (scaffold; see the
`run-samples` workflow header for what's deferred).
Samples coverage snapshot: [#5](https://github.com/honua-io/honua-samples/issues/5)
(producer snapshot published; honua-evidence-side dispatch/pull integration
deferred to [honua-evidence#3](https://github.com/honua-io/honua-evidence/issues/3)).
Gallery: [#3](https://github.com/honua-io/honua-samples/issues/3) (this PR; left
open until samples.honua.io is deployed and verified live with both inputs
rendering).
Gallery embeds: [#11](https://github.com/honua-io/honua-samples/issues/11)
(staging/integrity/embed pipeline implemented and verified end-to-end against
a synthetic fixture release matching honua-sdk-js's manifest schema exactly --
see that PR's description. Honest current state: honua-sdk-js's real
`sample-bundles-latest` release does not exist yet, because its
"Publish sample bundles release" job needs the "JS SDK" job, which has been
failing on every honua-sdk-js trunk push since #648 merged (an unrelated
evidence-neutral-checkout gate failure). Every gallery deploy therefore
degrades honestly to "no runnable build published yet" for every sdk-js entry
until that upstream job is fixed; nothing here is blocked on this repo).

## License

Apache-2.0 — copy anything here into your own projects.
