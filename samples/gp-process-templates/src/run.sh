#!/usr/bin/env bash
# Runs both GP process template test suites through the real custom-code
# harness. Needs a honua-server checkout (HONUA_SERVER_CHECKOUT, default:
# sibling of this repository) until the harness and SDK are published as
# packages, which is why the sample manifest is `draft` (validated, not run by
# the headless runner yet; see honua-io/honua-samples#65).
#
# HONUA_GP_PYTHON_VENV may point at an existing virtual environment (for a
# Python without ensurepip); otherwise one is created under templates/gp-python.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
server="${HONUA_SERVER_CHECKOUT:-${repo}/../honua-server}"
harness_src="${server}/docker/worker-customcode-python/harness"
if [ ! -d "${harness_src}" ]; then
  echo "gp-process-templates: honua-server checkout not found at ${server}; set HONUA_SERVER_CHECKOUT" >&2
  exit 2
fi
export HONUA_SERVER_CHECKOUT="${server}"

echo "== templates/gp-python"
venv="${HONUA_GP_PYTHON_VENV:-${repo}/templates/gp-python/.venv-gp}"
if [ ! -x "${venv}/bin/python" ]; then
  if ! python3 -m venv "${venv}"; then
    echo "gp-process-templates: python3 -m venv failed (install the python3-venv package or set HONUA_GP_PYTHON_VENV)" >&2
    exit 2
  fi
fi
"${venv}/bin/python" -m pip install --quiet --disable-pip-version-check --no-deps "${harness_src}"
"${venv}/bin/python" -m pip install --quiet --disable-pip-version-check pytest==9.1.1
HONUA_GP_PYTHON_HARNESS="${venv}/bin/honua-gp-python" "${venv}/bin/python" -m pytest -q "${repo}/templates/gp-python/tests"

echo "== templates/gp-dotnet"
dotnet test "${repo}/templates/gp-dotnet/tests/SummaryTool.Tests/SummaryTool.Tests.csproj" --nologo -m:2

echo "== template manifests"
node "${repo}/scripts/gp-templates.mjs" check
