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
script changes required.

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

## License

Apache-2.0 — copy anything here into your own projects.
