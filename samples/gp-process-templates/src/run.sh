#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
server="${HONUA_SERVER_CHECKOUT:-${repo}/artifacts/server-sdk}"
harness_src="${server}/docker/worker-customcode-python/harness"
if [ ! -d "${harness_src}" ]; then
  echo "gp-process-templates: honua-server checkout not found at ${server}; set HONUA_SERVER_CHECKOUT" >&2
  exit 2
fi
export HONUA_SERVER_CHECKOUT="${server}"
reports="${repo}/artifacts/gp-template-tests"
mkdir -p "${reports}"

echo "== templates/gp-python"
venv="${HONUA_GP_PYTHON_VENV:-${repo}/artifacts/gp-template-venv}"
if [ ! -x "${venv}/bin/python" ]; then
  if ! python3 -m venv "${venv}"; then
    echo "gp-process-templates: python3 -m venv failed (install the python3-venv package or set HONUA_GP_PYTHON_VENV)" >&2
    exit 2
  fi
fi
"${venv}/bin/python" -m pip install --quiet --disable-pip-version-check --no-deps "${harness_src}"
"${venv}/bin/python" -m pip install --quiet --disable-pip-version-check pytest==9.1.1
HONUA_GP_PYTHON_HARNESS="${venv}/bin/honua-gp-python" "${venv}/bin/python" -m pytest -q "${repo}/templates/gp-python/tests" --junitxml="${reports}/python.xml"

echo "== templates/gp-dotnet"
dotnet test "${repo}/templates/gp-dotnet/tests/SummaryTool.Tests/SummaryTool.Tests.csproj" --nologo -m:2 --logger trx --results-directory "${reports}"

echo "== template manifests"
node "${repo}/scripts/gp-templates.mjs" check
