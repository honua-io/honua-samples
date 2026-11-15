# Local geoprocessing with the Python SDK

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
This developer walkthrough tests the current GP submission contract; it does not qualify native feature queries or edits.

Submit and verify a 500-metre planar buffer using the published Python SDK.
Run these commands from the repository root with Python 3.11+ and Docker Compose:

```bash
python3 -m venv artifacts/gp-venv
artifacts/gp-venv/bin/python -m pip install -r samples/gp-local-dev/requirements.txt
docker compose -f docker/compose.yml -f docker/compose.gp.yml up --wait -d
PYTHON=artifacts/gp-venv/bin/python bash samples/gp-local-dev/submit-buffer.sh
docker compose -f docker/compose.yml -f docker/compose.gp.yml down --volumes --remove-orphans
```

The stack uses the gallery's pinned published Honua Server image, PostgreSQL,
and Redis. Its Development-only Pro grant enables the Redis-backed local job
queue. No worker product source is copied or built. The sample submits the
buffer, waits for completion, then checks polygon type, bounds, and area;
any mismatch fails the command and its CI job.

Set `BASE` and `KEY` for a different local server and API key. `PYTHON` selects
the interpreter. `points.csv` contains two XYZ features for the
[server authoring guide](https://github.com/honua-io/honua-server/blob/trunk/docs/guides/query-analyze/gp-devkit-authoring.md).
`buffer-plan.json` carries the same operation for an MCP client, while
`gp-local-dev.http` is an optional wire inspection companion.

For custom Python and .NET process implementations, use the maintained
[GP process templates](../gp-process-templates/README.md). They provide the
summary tool, golden and invalid-input fixtures, output-cap checks, and debugger
configuration instead of a second copy of the old custom-local examples.
