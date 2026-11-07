# GP process templates (Python and .NET)

Executable evidence for the two geoprocessing process templates under
[`templates/`](../../templates): [`gp-python`](../../templates/gp-python/README.md)
and [`gp-dotnet`](../../templates/gp-dotnet/README.md). Each template is a
complete process project against the production custom-code contract with a
fixture, golden expectations, a dependency lock, failure walkthroughs, and VS
Code launch configurations for host breakpoints and container attach. They are
the source that `honua-gp-devkit init` mirrors (honua-io/honua-server#6217);
`node scripts/gp-templates.mjs check` fails CI when a template changes without
its `TEMPLATE-MANIFEST.json`.

## Run

```bash
bash scripts/sync-server-sdk.sh
HONUA_SERVER_CHECKOUT="$PWD/artifacts/server-sdk" \
HONUA_GP_PYTHON_VENV="$PWD/artifacts/gp-template-venv" \
bash samples/gp-process-templates/src/run.sh
```

Run these commands from the repository root. The SDK checkout is pinned by
`config/server-sdk.v1.json` and contains only the authoring contracts and their
build dependencies. The script installs the Python custom-code harness into an ignored
virtual environment, runs the Python golden tests, runs the .NET golden tests
(which build the process, the harness, and the SDK from the checkout), and
verifies the template manifests. No server, Redis, Docker, or cloud credentials
are used; the data is the committed fixture.

## Why draft

The custom-code harness and `Honua.CustomCode.Sdk` are consumed from a
honua-server checkout because they are not published as packages yet. The
headless runner executes active samples against published artifacts only, so
this manifest stays `draft` (validated, not executed by `run-samples.mjs`)
until the packages exist. The template manifests and layout are checked on
every PR regardless. `Standalone samples` also executes both template test
suites against the pinned source contracts, without adding them to the active
gallery's coverage claims.
