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
HONUA_SERVER_CHECKOUT=/path/to/honua-server bash src/run.sh
```

The script installs the Python custom-code harness into a template-local
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
every PR regardless.
