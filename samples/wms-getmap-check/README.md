# Verify a WMS GetMap response

Publish three points to a local Honua deployment, enable WMS, request
`GetCapabilities`, and verify that `GetMap` returns a real `317x241` PNG.
The runner is zero-dependency Node.js using the platform `fetch()` API.

## Prerequisites

- Docker with the repository compose stack running
- Node.js 22 or later (no npm dependencies)

## Run

```bash
docker compose -f docker/compose.yml up -d --wait
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=quickstart-admin-password \
node samples/wms-getmap-check/src/run.mjs
```

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

This is intentionally a local integration sample. It does not claim the
public API currently exposes a working anonymous WMS service.
