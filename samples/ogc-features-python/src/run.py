#!/usr/bin/env python3
"""ogc-features-python

Pure standard-library Python walkthrough of OGC API Features against a
composed Honua Server. No SDK, no third-party HTTP client -- just
urllib.request -- so it reads as plain Python/HTTP to anyone, not a
Honua-flavored client.

Self-contained (honua-io/honua-samples#4): imports its own tiny GeoJSON
dataset (timestamped table name) and publishes it under a sample-owned
service name, so this can run before/after/alongside any other sample
without depending on run order.

Steps:
  1. Upload a small GeoJSON file (POST /api/v1/admin/import/upload), building
     the multipart/form-data body by hand since urllib has no built-in
     multipart encoder.
  2. Register the compose Postgres as a named connection (idempotent).
  3. Publish the imported table as a layer under a dedicated service.
  4. Enable the OgcFeatures protocol and open anonymous reads on that
     service, so the walk below also proves the no-API-key path works.
  5. Walk OGC API Features: landing page -> conformance -> collections ->
     paged items (following "next" links), asserting every imported feature
     round-trips with its name intact.

Zero dependencies beyond the Python 3 standard library.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE_URL = os.environ.get("HONUA_BASE_URL", "http://localhost:8080")
ADMIN_API_KEY = os.environ.get("HONUA_ADMIN_API_KEY", "quickstart-admin-password")
CONNECTION_NAME = os.environ.get("HONUA_SAMPLE_CONNECTION", "local")
SERVICE_NAME = os.environ.get("HONUA_SAMPLE_SERVICE", "ogc-features-python-sample")
# Timestamped so repeat runs against a long-lived server don't collide on
# table name; a fresh `docker compose down -v` also resolves this.
TABLE_NAME = os.environ.get("HONUA_SAMPLE_TABLE", "honua_samples_ogcfeat_%d" % int(time.time() * 1000))
LAYER_NAME = "ogc-features-python-points"
PAGE_LIMIT = 2

POINTS = [
    ("Ferry Building", -122.3937, 37.7955),
    ("Coit Tower", -122.4058, 37.8024),
    ("Painted Ladies", -122.4330, 37.7762),
    ("Golden Gate Bridge", -122.4783, 37.8199),
    ("Twin Peaks", -122.4477, 37.7544),
]

GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        }
        for name, lon, lat in POINTS
    ],
}


class SampleError(RuntimeError):
    pass


def _json_request(method, path, body=None, admin=True, ok_statuses=(200, 201)):
    url = "%s%s" % (BASE_URL, path)
    headers = {}
    data = None
    if admin:
        headers["X-API-Key"] = ADMIN_API_KEY
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            status = response.status
            payload_text = response.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        status = err.code
        payload_text = err.read().decode("utf-8", errors="replace")

    try:
        payload = json.loads(payload_text) if payload_text else {}
    except ValueError:
        raise SampleError(
            "%s %s: response was not JSON (HTTP %d): %s" % (method, path, status, payload_text[:500])
        )

    if status not in ok_statuses:
        raise SampleError("%s %s failed (HTTP %d): %s" % (method, path, status, payload))
    return status, payload


def upload_geojson():
    boundary = uuid.uuid4().hex
    parts = []

    def field(name, value):
        parts.append(("--%s\r\n" % boundary).encode("utf-8"))
        parts.append(('Content-Disposition: form-data; name="%s"\r\n\r\n' % name).encode("utf-8"))
        parts.append(("%s\r\n" % value).encode("utf-8"))

    field("TableName", TABLE_NAME)

    parts.append(("--%s\r\n" % boundary).encode("utf-8"))
    parts.append(
        b'Content-Disposition: form-data; name="file"; filename="points.geojson"\r\n'
    )
    parts.append(b"Content-Type: application/geo+json\r\n\r\n")
    parts.append(json.dumps(GEOJSON).encode("utf-8"))
    parts.append(b"\r\n")
    parts.append(("--%s--\r\n" % boundary).encode("utf-8"))

    body = b"".join(parts)
    request = urllib.request.Request(
        "%s/api/v1/admin/import/upload" % BASE_URL,
        data=body,
        headers={
            "X-API-Key": ADMIN_API_KEY,
            "Content-Type": "multipart/form-data; boundary=%s" % boundary,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raise SampleError("upload failed (HTTP %d): %s" % (err.code, err.read().decode("utf-8", errors="replace")))

    if not payload.get("success", True) or not payload.get("physicalTableName"):
        raise SampleError("upload response missing physicalTableName: %s" % payload)
    return payload["physicalTableName"]


def register_connection():
    # Check first rather than create-then-handle-conflict: a duplicate
    # connection name comes back as a generic 400, not a 409 (same quirk
    # documented in samples/hello-featureserver-rest) -- this keeps repeat
    # runs against a long-lived server idempotent.
    _, existing = _json_request("GET", "/api/v1/admin/connections")
    connections = existing.get("data") if isinstance(existing, dict) else None
    if isinstance(connections, list) and any(c.get("name") == CONNECTION_NAME for c in connections):
        return
    _json_request(
        "POST",
        "/api/v1/admin/connections",
        body={
            "name": CONNECTION_NAME,
            "host": "postgres",
            "port": 5432,
            "databaseName": "honua_dev",
            "username": "honua_user",
            "password": "honua_password",
            "sslRequired": False,
            "sslMode": "Prefer",
        },
    )


def publish_layer(physical_table_name):
    _, payload = _json_request(
        "POST",
        "/api/v1/admin/connections/%s/layers" % CONNECTION_NAME,
        body={
            "schema": "honua_data",
            "table": physical_table_name,
            "layerName": LAYER_NAME,
            "srid": 4326,
            "serviceName": SERVICE_NAME,
        },
    )
    data = payload.get("data", payload)
    if "layerId" not in data:
        raise SampleError("publish response missing layerId: %s" % payload)
    return data["layerId"]


def enable_ogc_features_protocol():
    _json_request(
        "PUT",
        "/api/v1/admin/services/%s/protocols" % SERVICE_NAME,
        body={"enabledProtocols": ["OgcFeatures"]},
    )


def allow_anonymous_reads():
    _json_request(
        "PUT",
        "/api/v1/admin/services/%s/access-policy" % SERVICE_NAME,
        body={"allowAnonymous": True},
    )


def anonymous_get(path):
    request = urllib.request.Request("%s%s" % (BASE_URL, path), method="GET")
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise SampleError("GET %s failed (HTTP %d): %s" % (path, err.code, body))


def walk_landing_and_conformance():
    _, landing = anonymous_get("/ogc/features")
    if not landing.get("title"):
        raise SampleError("landing page missing title: %s" % landing)
    conformance_links = [l for l in landing.get("links", []) if l.get("rel") == "conformance"]
    if not conformance_links:
        raise SampleError("landing page missing a conformance link: %s" % landing)

    _, conformance = anonymous_get("/ogc/features/conformance")
    conforms_to = conformance.get("conformsTo", [])
    core_class = "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core"
    if core_class not in conforms_to:
        raise SampleError("conformance declaration missing core class: %s" % conforms_to)


def find_collection(layer_id):
    _, collections = anonymous_get("/ogc/features/collections")
    collection_id = str(layer_id)
    matches = [c for c in collections.get("collections", []) if c.get("id") == collection_id]
    if not matches:
        raise SampleError("collection %s not found in /ogc/features/collections" % collection_id)
    return matches[0]


def walk_paged_items(layer_id):
    collected = []
    path = "/ogc/features/collections/%s/items?limit=%d" % (layer_id, PAGE_LIMIT)
    pages = 0
    seen_paths = set()

    while path:
        if path in seen_paths:
            raise SampleError("paging loop detected at %s" % path)
        seen_paths.add(path)

        _, page = anonymous_get(path)
        pages += 1
        collected.extend(page.get("features", []))

        next_link = next((l for l in page.get("links", []) if l.get("rel") == "next"), None)
        if next_link is None:
            path = None
        else:
            parsed = urllib.parse.urlsplit(next_link["href"])
            path = "?".join(filter(None, [parsed.path, parsed.query]))

    if pages < 2:
        raise SampleError("expected items paging to span >1 page with limit=%d, got %d page(s)" % (PAGE_LIMIT, pages))
    return collected


def main():
    started = time.time()
    print("[ogc-features-python] target server: %s" % BASE_URL)

    print("[ogc-features-python] 1/6 uploading %s (%d features)..." % (TABLE_NAME, len(POINTS)))
    physical_table_name = upload_geojson()

    print('[ogc-features-python] 2/6 registering connection "%s"...' % CONNECTION_NAME)
    register_connection()

    print('[ogc-features-python] 3/6 publishing layer "%s" on service "%s"...' % (LAYER_NAME, SERVICE_NAME))
    layer_id = publish_layer(physical_table_name)

    print("[ogc-features-python] 4/6 enabling OgcFeatures protocol + anonymous reads...")
    enable_ogc_features_protocol()
    allow_anonymous_reads()

    print("[ogc-features-python] 5/6 walking landing page + conformance...")
    walk_landing_and_conformance()
    find_collection(layer_id)

    print("[ogc-features-python] 6/6 paging items (limit=%d)..." % PAGE_LIMIT)
    features = walk_paged_items(layer_id)

    names = sorted(
        f.get("properties", {}).get("properties", {}).get("name")
        or f.get("properties", {}).get("name")
        for f in features
    )
    expected_names = sorted(name for name, _, _ in POINTS)
    missing_geometry = [f for f in features if not f.get("geometry")]
    duration_ms = int((time.time() - started) * 1000)

    if names != expected_names or missing_geometry:
        print(
            "[ogc-features-python] FAIL in %dms: expected %s, got %s (missing geometry on %d feature(s))"
            % (duration_ms, expected_names, names, len(missing_geometry)),
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        "[ogc-features-python] PASS in %dms: paged through %d feature(s) across collection %s (%s)"
        % (duration_ms, len(features), layer_id, ", ".join(names))
    )


if __name__ == "__main__":
    try:
        main()
    except SampleError as err:
        print("[ogc-features-python] FAIL: %s" % err, file=sys.stderr)
        sys.exit(1)
