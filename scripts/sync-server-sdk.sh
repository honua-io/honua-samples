#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
revision="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["revision"])' "${root}/config/server-sdk.v1.json")"
[[ "${revision}" =~ ^[0-9a-f]{40}$ ]] || { echo "SDK revision must be a full commit SHA" >&2; exit 2; }
sdk="${root}/artifacts/server-sdk"
if [[ ! -d "${sdk}/.git" ]]; then
  mkdir -p "${sdk}"
  git -C "${sdk}" init -q
  git -C "${sdk}" remote add origin https://github.com/honua-io/honua-server.git
fi
git -C "${sdk}" sparse-checkout init --no-cone
git -C "${sdk}" sparse-checkout set --no-cone --stdin <<'PATHS'
/Directory.Build.props
/Directory.Build.targets
/Directory.Packages.props
/.editorconfig
/LICENSE
/NOTICE
/README.md
/THIRD-PARTY-NOTICES.md
/src/Honua.Analyzers/
/src/Honua.Core.Abstractions/
/src/Honua.Plugins.Abstractions/
/docker/worker-customcode-dotnet/harness/
/docker/worker-customcode-python/harness/
PATHS
git -C "${sdk}" fetch --depth=1 --filter=blob:none origin "${revision}"
git -C "${sdk}" checkout -q --detach FETCH_HEAD
[[ "$(git -C "${sdk}" rev-parse HEAD)" == "${revision}" ]]
