"""Bounded raster downloads and reproducibility receipts."""

import hashlib
import json
from urllib.request import Request, urlopen


def fetch(url, destination, maximum_bytes):
    digest = hashlib.sha256()
    size = 0
    request = Request(url, headers={"User-Agent": "Honua-state-local-imagery/1"})
    with urlopen(request, timeout=120) as response, destination.open("wb") as output:
        if response.status != 200:
            raise ValueError("A complete source response is required")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > maximum_bytes:
                raise ValueError("Source exceeds the download budget")
            digest.update(chunk)
            output.write(chunk)
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) != size:
            raise ValueError("Source download is incomplete")
        return {"url": url, "sha256": digest.hexdigest(), "bytes": size,
                "etag": response.headers.get("ETag")}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def output_digest(path):
    return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bytes": path.stat().st_size}


