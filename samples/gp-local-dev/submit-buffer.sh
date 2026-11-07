#!/usr/bin/env bash
# Run the installed-SDK local GP quickstart (see submit-buffer.py).
# Install the pinned SDK from this sample's requirements.txt.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${PYTHON:-python3}" "$HERE/submit-buffer.py"
