#!/usr/bin/env python3

import json
import os
import sys
import urllib.request

BASE_URL = os.environ.get("HONUA_BASE_URL", "https://demo.honua.io")


def get_json(path):
    with urllib.request.urlopen(BASE_URL + path) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    landing = get_json("/ogc/features")
    if not any(link.get("rel") == "conformance" for link in landing.get("links", [])):
        raise RuntimeError("Landing page has no conformance link")

    catalog = get_json("/ogc/features/collections")
    collection = catalog.get("collections", [None])[0]
    if not collection:
        raise RuntimeError("No public OGC collection is available")

    page = get_json("/ogc/features/collections/%s/items?limit=2" % collection["id"])
    features = page.get("features", [])
    if not features or any(not feature.get("geometry") for feature in features):
        raise RuntimeError("Expected GeoJSON features with geometry")

    print(
        "PASS: %s returned %d GeoJSON feature(s) with geometry"
        % (collection.get("title", collection["id"]), len(features))
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("FAIL: %s" % error, file=sys.stderr)
        sys.exit(1)
