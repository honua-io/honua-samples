# Verify a WMS GetMap response

Publish three points to a local Honua deployment, enable WMS, request
`GetCapabilities`, and verify that `GetMap` returns a real `317x241` PNG.

## Prerequisites

- A clone of this repository; run the commands below from its root
- Docker with Compose v2 (`docker compose`), and ports `8080` and `5432` free
- Bash, `curl`, `jq`, and `od`

## Run

Start the repository compose stack on the 2026.1 release server image, then
run the sample against it. The admin key is the stack's
`HONUA_ADMIN_PASSWORD`, which `docker/compose.yml` defaults to
`quickstart-admin-password`:

```bash
export HONUA_SERVER_IMAGE=ghcr.io/honua-io/honua-server:nightly-87966c3@sha256:069f196bfa5c7201223d4d89868934242c4ace8805a6e48c122a88d84fa6eb1a
docker compose -f docker/compose.yml up -d --wait
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY="${HONUA_ADMIN_PASSWORD:-quickstart-admin-password}" \
bash samples/wms-getmap-check/src/run.sh
```

The last line reports
`PASS in ...ms: GetMap returned a 317x241 image/png (... bytes) for layer "wms-getmap-check-points"`.

Without `HONUA_SERVER_IMAGE`, `docker/compose.yml` uses the trunk-tracking
`:trunk` tag, which is not the release.

Stop the stack and remove its data when you are done:

```bash
docker compose -f docker/compose.yml down -v
```

This is intentionally a local integration sample. It does not claim the
public API currently exposes a working anonymous WMS service.
