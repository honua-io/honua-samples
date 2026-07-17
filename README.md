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

Published at samples.honua.io (bootstrap pending).

## Status

Bootstrap. Coordination: [honua-server#2892](https://github.com/honua-io/honua-server/issues/2892).
Manifest schema + validation CI: [#1](https://github.com/honua-io/honua-samples/issues/1).
Headless runner: [#2](https://github.com/honua-io/honua-samples/issues/2) (scaffold; see the
`run-samples` workflow header for what's deferred).
Samples coverage snapshot: [#5](https://github.com/honua-io/honua-samples/issues/5)
(producer snapshot published; honua-evidence-side dispatch/pull integration
deferred to [honua-evidence#3](https://github.com/honua-io/honua-evidence/issues/3)).

## License

Apache-2.0 — copy anything here into your own projects.
