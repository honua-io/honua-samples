# Verify a WMS GetMap response

Publish three points to a local Honua deployment, enable WMS, request
`GetCapabilities`, and verify that `GetMap` returns a real `317x241` PNG.

## Prerequisites

- Docker with the repository compose stack running
- Bash, `curl`, `jq`, and `od`

## Run

```bash
docker compose -f docker/compose.yml up -d --wait
HONUA_BASE_URL=http://localhost:8080 \
HONUA_ADMIN_API_KEY=quickstart-admin-password \
bash samples/wms-getmap-check/src/run.sh
```

This is intentionally a local integration sample. It does not claim the
public API currently exposes a working anonymous WMS service.
