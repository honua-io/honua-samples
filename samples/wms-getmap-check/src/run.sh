#!/usr/bin/env bash
# wms-getmap-check
#
# Plain bash+curl walkthrough of classic WMS against a composed Honua
# Server. No SDK, no scripting language beyond POSIX-ish bash + curl + jq +
# od -- readable by anyone who already speaks curl.
#
# Self-contained (honua-io/honua-samples#4): imports its own tiny GeoJSON
# dataset (timestamped table name) and publishes it under a sample-owned
# service name, so this can run before/after/alongside any other sample
# without depending on run order.
#
# Steps:
#   1. Upload a small GeoJSON file (POST /api/v1/admin/import/upload).
#   2. Register the compose Postgres as a named connection (idempotent).
#   3. Publish the imported table as a layer under a dedicated service.
#   4. Enable the Wms protocol and open anonymous reads on that service.
#   5. GetCapabilities -- assert the published layer name appears in the XML.
#   6. GetMap at an explicit, non-square WIDTH/HEIGHT -- assert the response
#      is really a PNG (Content-Type header AND PNG magic bytes) and that
#      its IHDR-encoded dimensions match what was requested (the "dimensions
#      marker" -- a 200 with an empty/wrong-sized body would still pass a
#      naive status-code-only check).
#
# Dependencies: curl, jq (both preinstalled on GitHub Actions ubuntu-latest
# runners), and GNU/uutils od for the PNG IHDR byte check.

set -euo pipefail

BASE_URL="${HONUA_BASE_URL:-http://localhost:8080}"
ADMIN_API_KEY="${HONUA_ADMIN_API_KEY:-quickstart-admin-password}"
CONNECTION_NAME="${HONUA_SAMPLE_CONNECTION:-local}"
SERVICE_NAME="${HONUA_SAMPLE_SERVICE:-wms-getmap-check-sample}"
TABLE_NAME="${HONUA_SAMPLE_TABLE:-honua_samples_wms_$(date +%s%N)}"
LAYER_NAME="wms-getmap-check-points"
MAP_WIDTH=317
MAP_HEIGHT=241
SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

log() { printf '[wms-getmap-check] %s\n' "$1"; }
fail() { printf '[wms-getmap-check] FAIL: %s\n' "$1" >&2; exit 1; }

# curl wrapper: writes the response body to $2 and returns the HTTP status
# code on stdout, so callers can assert on both.
http_json() {
  local method="$1" path="$2" body_file="$3" data="${4:-}"
  local out="$SCRATCH_DIR/resp.json"
  local status
  if [[ -n "$data" ]]; then
    status=$(curl -s -o "$out" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H "X-API-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d "$data")
  else
    status=$(curl -s -o "$out" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H "X-API-Key: $ADMIN_API_KEY")
  fi
  cp "$out" "$body_file"
  echo "$status"
}

start_ts=$(date +%s%N)

log "target server: $BASE_URL"

log "1/6 uploading $TABLE_NAME (3 features)..."
cat > "$SCRATCH_DIR/points.geojson" <<EOF
{"type":"FeatureCollection","features":[
 {"type":"Feature","properties":{"name":"Ferry Building"},"geometry":{"type":"Point","coordinates":[-122.3937,37.7955]}},
 {"type":"Feature","properties":{"name":"Coit Tower"},"geometry":{"type":"Point","coordinates":[-122.4058,37.8024]}},
 {"type":"Feature","properties":{"name":"Painted Ladies"},"geometry":{"type":"Point","coordinates":[-122.433,37.7762]}}
]}
EOF

upload_status=$(curl -s -o "$SCRATCH_DIR/upload.json" -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/admin/import/upload" \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -F "file=@$SCRATCH_DIR/points.geojson;type=application/geo+json" \
  -F "TableName=$TABLE_NAME")
[[ "$upload_status" == "200" ]] || fail "upload failed (HTTP $upload_status): $(cat "$SCRATCH_DIR/upload.json")"
physical_table_name=$(jq -r '.physicalTableName // empty' "$SCRATCH_DIR/upload.json")
[[ -n "$physical_table_name" ]] || fail "upload response missing physicalTableName: $(cat "$SCRATCH_DIR/upload.json")"

log "2/6 registering connection \"$CONNECTION_NAME\"..."
existing_status=$(http_json GET /api/v1/admin/connections "$SCRATCH_DIR/connections.json")
[[ "$existing_status" == "200" ]] || fail "list connections failed (HTTP $existing_status)"
already_exists=$(jq -r --arg name "$CONNECTION_NAME" '[.data[]? | select(.name == $name)] | length > 0' "$SCRATCH_DIR/connections.json")
if [[ "$already_exists" != "true" ]]; then
  connection_body=$(jq -n --arg name "$CONNECTION_NAME" '{
    name: $name, host: "postgres", port: 5432, databaseName: "honua_dev",
    username: "honua_user", password: "honua_password",
    sslRequired: false, sslMode: "Prefer"
  }')
  connect_status=$(http_json POST /api/v1/admin/connections "$SCRATCH_DIR/connect.json" "$connection_body")
  [[ "$connect_status" == "200" || "$connect_status" == "201" ]] || fail "connection registration failed (HTTP $connect_status): $(cat "$SCRATCH_DIR/connect.json")"
fi

log "3/6 publishing layer \"$LAYER_NAME\" on service \"$SERVICE_NAME\"..."
publish_body=$(jq -n --arg table "$physical_table_name" --arg layer "$LAYER_NAME" --arg service "$SERVICE_NAME" '{
  schema: "honua_data", table: $table, layerName: $layer, srid: 4326, serviceName: $service
}')
publish_status=$(http_json POST "/api/v1/admin/connections/$CONNECTION_NAME/layers" "$SCRATCH_DIR/publish.json" "$publish_body")
[[ "$publish_status" == "200" || "$publish_status" == "201" ]] || fail "layer publish failed (HTTP $publish_status): $(cat "$SCRATCH_DIR/publish.json")"

log "4/6 enabling Wms protocol + anonymous reads..."
protocols_status=$(http_json PUT "/api/v1/admin/services/$SERVICE_NAME/protocols" "$SCRATCH_DIR/protocols.json" '{"enabledProtocols":["Wms"]}')
[[ "$protocols_status" == "200" ]] || fail "protocol enable failed (HTTP $protocols_status): $(cat "$SCRATCH_DIR/protocols.json")"
access_status=$(http_json PUT "/api/v1/admin/services/$SERVICE_NAME/access-policy" "$SCRATCH_DIR/access.json" '{"allowAnonymous":true}')
[[ "$access_status" == "200" ]] || fail "access-policy update failed (HTTP $access_status): $(cat "$SCRATCH_DIR/access.json")"

log "5/6 requesting GetCapabilities..."
# Publishing and protocol changes invalidate metadata asynchronously on the
# current trunk server. Poll the real WMS document to convergence instead of
# mistaking the first, pre-invalidation snapshot for the final contract.
capabilities_deadline=$((SECONDS + 30))
while true; do
  capabilities_status=$(curl -s -o "$SCRATCH_DIR/capabilities.xml" -w '%{http_code}' \
    "$BASE_URL/ogc/services/$SERVICE_NAME/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities")
  if [[ "$capabilities_status" == "200" ]] && grep -q "<Name>$LAYER_NAME</Name>" "$SCRATCH_DIR/capabilities.xml"; then
    break
  fi
  if (( SECONDS >= capabilities_deadline )); then
    fail "GetCapabilities did not converge on layer \"$LAYER_NAME\" within 30s (last HTTP $capabilities_status): $(cat "$SCRATCH_DIR/capabilities.xml")"
  fi
  sleep 1
done

log "6/6 requesting GetMap (${MAP_WIDTH}x${MAP_HEIGHT})..."
map_file="$SCRATCH_DIR/map.png"
map_response=$(curl -s -D "$SCRATCH_DIR/map_headers.txt" -o "$map_file" -w '%{http_code}' \
  "$BASE_URL/ogc/services/$SERVICE_NAME/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=$LAYER_NAME&STYLES=&CRS=EPSG:4326&BBOX=37.7,-122.5,37.9,-122.3&WIDTH=$MAP_WIDTH&HEIGHT=$MAP_HEIGHT&FORMAT=image/png")
[[ "$map_response" == "200" ]] || fail "GetMap failed (HTTP $map_response)"

content_type=$(grep -i '^content-type:' "$SCRATCH_DIR/map_headers.txt" | tr -d '\r' | cut -d' ' -f2-)
[[ "$content_type" == image/png* ]] || fail "GetMap Content-Type was not image/png (got: $content_type)"

byte_count=$(wc -c < "$map_file" | tr -d ' ')
[[ "$byte_count" -gt 100 ]] || fail "GetMap response body suspiciously small ($byte_count bytes)"

png_magic=$(od -An -tx1 -N 8 "$map_file" | tr -d ' \n')
[[ "$png_magic" == "89504e470d0a1a0a" ]] || fail "GetMap response is not a PNG (magic bytes: $png_magic)"

# PNG IHDR: width is bytes 16-19, height is bytes 20-23, both big-endian
# unsigned 32-bit -- this is the "dimensions marker" that proves the server
# actually rendered the requested size, not just returned *a* PNG.
read -r ihdr_width ihdr_height <<< "$(od --endian=big -An -tu4 -j 16 -N 8 "$map_file")"
[[ "$ihdr_width" == "$MAP_WIDTH" && "$ihdr_height" == "$MAP_HEIGHT" ]] \
  || fail "GetMap PNG dimensions mismatch: requested ${MAP_WIDTH}x${MAP_HEIGHT}, got ${ihdr_width}x${ihdr_height}"

end_ts=$(date +%s%N)
duration_ms=$(( (end_ts - start_ts) / 1000000 ))

log "PASS in ${duration_ms}ms: GetMap returned a ${ihdr_width}x${ihdr_height} image/png (${byte_count} bytes) for layer \"$LAYER_NAME\""
