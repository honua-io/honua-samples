# Workbench server analysis

The approved workbench includes a **Server analysis** panel. It accepts real
server GeoJSON for clustering, spatial join and H3 density, exposes the numbers,
overlays the returned geometry and exports CSV/GeoJSON with provenance. The
existing local planner remains labelled separately. Missing or invalid server
results never become scripted counts. These are compatibility API journeys;
they do not establish native protocol qualification.

No analysis recordings ship in the repository. Without a deployment manifest,
the panel says that server analysis has not been published. Do not mark this
journey demo-ready until all three real Maui runs and agent executions have
been captured and verified against the installed candidate.

## Capture real results

Import the licensed Maui source layers through Honua's import API, publish
them, then prepare a manifest in an ignored artifact directory:

```json
{
  "dataset": {
    "name": "County of Maui — exact imported layer/subset name",
    "sourceUrl": "https://source.example/replace-with-original-open-data-url",
    "license": "Replace with the source's actual redistribution terms and attribution",
    "sha256": "REPLACE_WITH_SHA256_OF_THE_EXACT_IMPORTED_DATA"
  },
  "operations": {
    "clusters": {"request": {"method": "POST", "url": "/rest/services/SERVICE/FeatureServer/0/queryClusters", "body": {"algorithm": "DBSCAN", "eps": 1000, "minPoints": 2, "returnHullPerCluster": true}}},
    "join": {"request": {"method": "POST", "url": "/rest/services/SERVICE/FeatureServer/0/spatialJoin", "body": {"joinLayerId": 123, "predicate": "intersects"}}},
    "h3": {"cellLimit": 100000, "request": {"method": "GET", "url": "/ogc/features/collections/COLLECTION/h3?resolution=7"}}
  }
}
```

These are placeholders, not runnable Maui evidence. Use actual published
service/collection identifiers and the join layer's storage ID. Use a bounded
Maui subset; truncated responses are rejected. For H3, set `cellLimit` to the
installed server’s `QueryLimits.MaxH3CellsPerQuery`; the example value is only a
placeholder. Before recording H3, the recorder reads
`GET /api/v1/capabilities/manifest` (an admin route, so set
`HONUA_ANALYSIS_API_KEY`) and stops if `limits.analysis.maxH3CellsPerQuery`
differs from `cellLimit`. When the manifest reports `h3Available: false` (the
default PostGIS-only image has no `h3-pg`), H3 is skipped with that reason and
left out of the output manifest, so the workbench shows it as not published.
H3 responses at the limit are rejected because the endpoint can silently cap
cells. Preserve this setting in recorded manifests. If operations use different
source layers, hash and describe the exact combined input archive, including
the subset definitions. Verify that input independently before capture.

```sh
HONUA_ANALYSIS_SERVER=http://localhost:26080 \
HONUA_ANALYSIS_SERVER_IMAGE=sha256:INSTALLED_DIGEST \
node scripts/state-local/record-workbench-analysis.mjs \
  artifacts/analysis-input.json artifacts/workbench-analysis
```

For a protected capture, inject `HONUA_ANALYSIS_API_KEY` from the existing secret
store. The recorder never writes that header. Never put credentials in a URL,
request body or manifest. Each output includes the exact response text, its
checksum, input checksum, request, server image and capture time. Recordings
are replayed as **Recorded server result**, including their original timestamp.

## Attach a real agent answer

Give a stock MCP client the captured table and realistic question, for example
“Chart the school counts per cluster.” Preserve the actual provider/model,
execution ID and time. Convert its actual chart output to this artifact shape:

```json
{"question":"Actual question","provider":"Actual provider","model":"Actual model","runId":"Actual execution ID","createdAt":"ISO timestamp","resultSha256":"EXACT_RESPONSE_SHA256","chart":{"title":"Actual chart title","series":[{"label":"EXACT_TABLE_CATEGORY","value":123}]}}
```

Every table row must appear exactly once, with the same numerical value. Add
`"agentRecording": "clusters-agent.json"` alongside `"recording": "clusters.json"`
in the output manifest. Never hand-author an answer or describe harness doubles
as agent runs. A missing agent leaves the real analysis table available and
clearly says the agent chart is unavailable. An invalid agent artifact fails
publication.

## Publish and verify

```sh
HONUA_WORKBENCH_ANALYSIS=artifacts/workbench-analysis \
node scripts/state-local/build-display-site.mjs
node scripts/smoke-workbench-analysis.mjs
```

The builder copies only referenced JSON artifacts after validating checksums
and charts. Unreferenced files are excluded. Without the environment setting,
previous analysis artifacts are removed and the public manifest contains JSON `null`,
so the panel can report availability without requesting a missing resource. A live manifest can instead specify
public GET/POST requests; the browser omits credentials and requires HTTPS
(localhost HTTP is allowed for verification). Server/CORS/entitlement errors
are visible and never fall back to recordings.

The browser contract test uses explicitly labelled harness doubles. It covers
signed-out desktop/mobile, all three operations, map/table/chart consistency,
exports and a tampered response. It is not live evidence. Nightly runs this
contract after building the gallery. Installed verification must separately
run all three Maui analyses, check every chart value, record screenshot and
export artifacts outside the repository, and exercise an unavailable endpoint.
