# Verify a WMS GetMap response

Publish three points to a local Honua deployment, enable WMS, request
`GetCapabilities`, and verify that `GetMap` returns a real `317x241` PNG.
The runner is zero-dependency Node.js using the platform `fetch()` API.

## Prerequisites

- A clone of this repository; run the commands below from its root
- Docker with Compose v2 (`docker compose`), and ports `8080` and `5432` free
- Node.js 22 or later (no npm dependencies)

## Run

Choose an immutable image from the public
[Honua Server packages](https://github.com/honua-io/honua-server/pkgs/container/honua-server)
page. Replace `<CANDIDATE_SERVER_IMAGE>` below with its full
`ghcr.io/honua-io/honua-server:<tag>@sha256:<digest>` reference.
The 2026.1 release has not been cut; nightly images are previews, not
qualified releases. Release certification binds this declared input to its
exact candidate.

Start the repository compose stack with that image and run the sample.
The admin key is the stack's
`HONUA_ADMIN_PASSWORD`, which `docker/compose.yml` defaults to
`quickstart-admin-password`:

```bash
export HONUA_SERVER_IMAGE='<CANDIDATE_SERVER_IMAGE>'
docker compose -f docker/compose.yml up -d --wait
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY="${HONUA_ADMIN_PASSWORD:-quickstart-admin-password}" \
node samples/wms-getmap-check/src/run.mjs
```

The last line reports
`[wms-getmap-check] PASS in ...ms: 317x241 image/png (... bytes)`.

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_ADMIN_API_KEY` | `quickstart-admin-password` | `X-API-Key` used for admin calls. |
| `HONUA_SAMPLE_CONNECTION` | `local` | Connection name to register/reuse. |
| `HONUA_SAMPLE_SERVICE` | `wms-getmap-check-sample` | Service name this sample publishes under. |
| `HONUA_SAMPLE_TABLE` | `honua_samples_wms_<timestamp>` | Table name for the imported data. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed).

Without `HONUA_SERVER_IMAGE`, `docker/compose.yml` uses the trunk-tracking
`:trunk` tag, which is not the release.

Stop the stack and remove its data when you are done:

```bash
docker compose -f docker/compose.yml down -v
```

This is intentionally a local integration sample. It does not claim the
public API currently exposes a working anonymous WMS service.
