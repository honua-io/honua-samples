# Maui department data pipeline

Run against a disposable local Honua Server with its managed import database:

```sh
export HONUA_BASE_URL=http://localhost:8080
export HONUA_ADMIN_API_KEY=your-local-admin-key
node samples/maui-data-pipeline/src/run.mjs
```

The sample creates missing department folders and a local managed connection,
downloads the real Maui fire-station data and its terms/metadata, verifies the
snapshot, imports through the Honua admin API and checks that publication stays
disabled in Emergency Management with its licence and attribution. This is a
data-ingestion check; it does not assert a released emergency application.

The local connection defaults match the repository Compose stack. Use
`HONUA_SAMPLE_CONNECTION` for an existing connection; when creating one,
`HONUA_SAMPLE_DB_HOST`, `HONUA_SAMPLE_DB_PORT`, `HONUA_SAMPLE_DB_NAME`,
`HONUA_SAMPLE_DB_USER` and `HONUA_SAMPLE_DB_PASSWORD` override local defaults.
Each run retains a new disabled table for Console inspection. Do not run this
against a shared deployment without its operator's approval.

Snapshots go under ignored `artifacts/state-local/ci/`; large data is never
committed. See [sources, licences and the full pipeline](../../docs/state-local-data.md).
