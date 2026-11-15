#!/usr/bin/env python3
"""Build the source catalog JSON for the SDK Explorer screen.

Reads examples from origin/trunk of honua-sdk-js, honua-samples and honua-server (run `git fetch` in all three first), so a stale
checkout never leaks into the gallery. Hand-written fields: category, title, one-line description, API names and lifecycle status. Read from git: README (rendered to HTML), the main source file (trimmed) and package/sample metadata.

Usage: python3 -I sdk_samples.py --root /path/to/workspace --output /path/to/catalog.json
The workspace folder must hold all three repositories with freshly fetched origin/trunk refs.
"""
import argparse, html, json, os, re, subprocess

EXCERPT_LINES = 44

CATEGORIES = [
    ("start", "Getting started"),
    ("maps", "Maps and layers"),
    ("query", "Query and filter"),
    ("edit", "Editing"),
    ("analysis", "Analysis and charts"),
    ("gp", "Geoprocessing"),
    ("ai", "AI and natural language"),
    ("interop", "Interop: OGC, GeoServices, STAC, OData"),
    ("frameworks", "Frameworks: React, vanilla, Node, .NET"),
]

# id, repo, category, title, description, API names, lifecycle metadata
SDK_REPO, SAMPLES_REPO = "sdk-js", "samples"
CATALOG = [
    ("maplibre-quickstart", SDK_REPO, "start", "First Map: endpoint to inspected map", "The canonical five-minute journey: connect, discover, explain, query and mount one source on MapLibre.", ["createHonua", "honua.connect", "connection.inspect", "connection.explain", "connection.query", "connection.mount", "maplibreRenderer"], ['TypeScript'], {}),
    ("hello-featureserver-rest", SAMPLES_REPO, "start", "Query a public FeatureServer", "Read three real Maui building features with plain fetch(). No account, key or SDK.", ["FeatureServer /query"], ['Node'], {}),
    ("oauth-signin", SDK_REPO, "start", "OAuth2 sign-in with PKCE", "Sign in with authorization code and PKCE against a mock identity provider, then call a bearer-protected API.", ["oauth2", "HonuaClient", "HonuaAuthError"], ['TypeScript'], {}),

    ("maplibre-featureserver-layer", SAMPLES_REPO, "maps", "FeatureServer layer in MapLibre GL JS", "One HTML file loads a FeatureServer layer as GeoJSON, fits the map to it and opens a popup on click.", ["FeatureServer ?f=json", "FeatureServer /query f=geojson", "maplibregl.Map", "fitBounds", "maplibregl.Popup"], ['HTML'], {}),
    ("maplibre-category-style-legend", SAMPLES_REPO, "maps", "Category style and legend from OGC API Features", "Colour features by a category field with one match expression; the legend and popup use the same values.", ["/queryables", "/items", "match expression"], ['HTML'], {}),
    ("maplibre-ogc-tiles-mvt", SAMPLES_REPO, "maps", "OGC API Tiles vector tiles in MapLibre", "Turn a tileset's templated link into a MapLibre vector source; Maui buildings extruded by render_height.", ["/tiles", "fill-extrusion"], ['HTML'], {}),
    ("pmtiles-static", SDK_REPO, "maps", "PMTiles static basemap", "A basemap from one .pmtiles archive on static hosting; the runtime registers pmtiles:// and reads the archive metadata.", ["describePmtilesArchive", "isPmtilesProtocolRegistered", "loadMapPackage", "HonuaClient"], ['TypeScript'], {}),
    ("storytelling-25d-map", SDK_REPO, "maps", "2.5D storytelling map", "A pitched corridor walkthrough: compatibility gating, OGC API Features extrusions, hover and selection.", ["HonuaClient.checkCompatibility", "ogcFeatures().collection().items()", "toMapLibreExtrusionLayer", "createHoverHandler", "createSelectionHandler"], ['TypeScript'], {}),
    ("temporal-playback", SDK_REPO, "maps", "Temporal playback", "Animate a month of events with createTemporalPlayback, styled by a classBreaksRenderer and its legend.", ["createTemporalPlayback", "classBreaksRenderer", "renderer.legendItems"], ['TypeScript'], {}),
    ("imagery-cog-quickstart", SDK_REPO, "maps", "Imagery and terrain journey", "Search STAC by extent, date and cloud cover, open a COG on MapLibre and sample an elevation profile.", ["connect", "HonuaClient.stac().search", "openStacCogAsset", "mountStacCogAssetToMapLibre", "sampleElevationProfile"], ['TypeScript'], {}),

    ("maui-311", SAMPLES_REPO, "maps", "311 operations", "Labelled service-request exercises over public Maui geography.", ["HonuaClient"], ['TypeScript'], {}),
    ("maui-emergency", SAMPLES_REPO, "maps", "Emergency preparedness exercise", "Public geography and explicitly fictional shelter and road-status records.", ["HonuaClient"], ['TypeScript'], {}),
    ("maui-public-works", SAMPLES_REPO, "maps", "Public works assets", "Public road and bridge sources with labelled inspection exercises.", ["HonuaClient"], ['TypeScript'], {}),
    ("county-parcel-viewer", SAMPLES_REPO, "query", "County parcel viewer", "Find a parcel by TMK, address or click and see the zoning and FEMA flood zones that cover it, with shares.", ["connect", "QueryBuilder", "HonuaGeocodingClient", "esriGeometryToGeoJSON", "registerPmtilesSource"], ['TypeScript'], {}),
    ("geocoding-quickstart", SDK_REPO, "query", "Address to pin", "One HonuaGeocodingClient.forwardGeocode() request; the chosen candidate becomes a synchronized MapLibre pin.", ["HonuaGeocodingClient", "forwardGeocode"], ['TypeScript'], {}),
    ("geocode-single-line", SAMPLES_REPO, "query", "Geocode one address", "Send one anonymous request to a GeocodeServer and print the best candidate.", ["GeocodeServer findAddressCandidates"], ['Node'], {}),
    ("columnar-query-quickstart", SDK_REPO, "query", "Map a bounded Arrow result", "Plan a FeatureServer f=arrow request and decode one bounded GeoArrow batch for MapLibre.", ["openColumnarSession", "createApacheArrowResponseDecoder", "ColumnarWorkflowError"], ['TypeScript'], {}),
    ("overture-geoparquet", SDK_REPO, "query", "Overture columnar lab", "A protocol-neutral spatial query on GeoParquet through DuckDB-WASM, with one bounded policy.", ["GeoparquetRuntime", "createBrowserDuckDbDriver", "geoparquetResolver", "createDataset"], ['TypeScript'], {}),

    ("sketch-editing", SDK_REPO, "edit", "Sketch editing with terra-draw", "Draw, edit and delete through one edit-sketch workflow with snapping, undo and redo, then applyEdits.", ["createEditSketchWorkflow", "createSnapIndex", "createTerraDrawSketch", "terraDrawSketchToolCapabilities", "workflow.submit"], ['TypeScript'], {}),
    ("edit-workflow-demo", SDK_REPO, "edit", "Edit workflow demo", "Metadata-backed forms, optimistic edits, attachments, conflicts and recovery on one fixture layer.", ["createEditSession", "createEditSketchWorkflow", "createSnapIndex", "resolveSnapCandidate"], ['TypeScript'], {}),

    ("spatial-analytics-workbench", SDK_REPO, "analysis", "Linked spatial analysis workbench", "Explain, accept, execute: one query plan links the area, the filter, the map, the table and the chart.", ["createExplorationContext", "connectView", "setAggregation", "setFilter", "selectLinkedViewQueryProjection", "explainQuery"], ['TypeScript'], {}),
    ("maui-workbench", SAMPLES_REPO, "analysis", "Maui linked analysis workbench", "Parcel and fictional 311 layers share one filter registry across the map, table and status chart, with bounded exports.", ["connect", "createFilterRegistry", "projectFilterRegistryToQuery", "compileOgcApiFeaturesQuery", "createEditSketchWorkflow"], ['TypeScript'], {}),
    ("realtime-incident-dashboard", SDK_REPO, "analysis", "Realtime incident dashboard", "Uses the server stream when advertised, else a visible read-only replay; map, filters, queue and metrics stay linked.", ["createHonuaServerRealtimeSubscription", "createRealtimeFeatureStore", "bindFilterControlsToExploration", "syncMapLayerFilterToExploration", "uniqueValueRenderer"], ['TypeScript'], {}),

    ("geoprocessing-job-runner", SDK_REPO, "gp", "Run a buffer job and collect the result", "Execute geometry.buffer through OGC API Processes, follow the job and read its output.", ["HonuaClient", "ogcProcesses().execute", "job.result"], ['TypeScript'], {}),
    ("gp-local-dev", SAMPLES_REPO, "gp", "Local geoprocessing with the Python SDK", "Submit and verify a 500 m planar buffer with the published Python SDK.", ["honua_sdk.HonuaClient", "client.geoprocessing()"], ['Python'], {}),
    ("gp-process-templates", SAMPLES_REPO, "gp", "GP process templates", "Executable evidence for the Python and .NET process templates against the custom-code contract.", ["custom-code worker contract"], ['Python', '.NET'], {}),
    ("maui-data-pipeline", SAMPLES_REPO, "gp", "Maui department data pipeline", "Import department data into a disposable local Honua Server through the admin REST API.", ["admin REST imports"], ['Node'], {}),

    ("nl-map-control", SDK_REPO, "ai", "Ask this map", "Review a schema-grounded spatial query, approve it, then see the same returned IDs on the map and in the table.", ["createAskMapSession", "createNlMapControl", "mountAskMapControl", "session.invalidate", "compileSemanticDuckDbQuery"], ['TypeScript'], {"status": "Experimental"}),
    ("ai-spatial-app-builder", SDK_REPO, "ai", "Safe agent workbench", "An agent proposes spatial work; the SDK authorizes the effect with a dry run, an approval and a verifiable receipt.", ["dryRunAgentPlan", "issueAgentApproval", "verifyAgentStepAuthorization", "issueAgentExecutionReceipt", "explainQuery"], ['TypeScript'], {}),
    ("mcp-gis-assistant", SDK_REPO, "ai", "MCP GIS assistant", "Grounded discovery of services, layers and schemas with review-before-apply filters and raw tool-call diagnostics.", ["createExplorationContext", "createHonuaAppWorkspace", "selectHonuaAppWorkspaceDrafts"], ['TypeScript'], {}),

    ("service-explorer", SDK_REPO, "interop", "Universal GIS service explorer", "Paste a service root, inspect discovery evidence and run only operations both the endpoint and the planner accept.", ["createHonua", "explainAutomaticSourceToMapLibre", "mountAutomaticSourceToMapLibre", "executeQueryPlan"], ['TypeScript'], {}),
    ("coverages-wcs-basic", SDK_REPO, "interop", "Coverages and WCS", "OGC API Coverages and WCS 2.0.1 clients side by side, both mounted as MapLibre raster layers.", ["createCoverageClient", "createWcsClient", "coverageToMapLibreImage"], ['TypeScript'], {}),
    ("stac-imagery-browser", SDK_REPO, "interop", "Find recent Maui imagery", "Search a bounded Maui STAC API, page the results, preview a scene and hand the asset to the right SDK surface.", ["createDynamicStacClient", "HonuaClient.stac", "inspectPmtilesArchive"], ['TypeScript'], {}),
    ("stac-search-rest", SAMPLES_REPO, "interop", "Discover a public STAC catalog", "Read the STAC root and collections and report which can be explored further.", ["STAC /collections"], ['Node'], {}),
    ("stac-ops", SAMPLES_REPO, "interop", "STAC operations dashboard", "A Blazor WebAssembly dashboard for a Honua STAC catalog: validators, extensions, query probes and timing.", ["STAC API"], ['.NET'], {}),
    ("odata-query-rest", SAMPLES_REPO, "interop", "Read spatial features with OData v4", "Discover one public layer and read three features through OData with plain fetch().", ["OData $metadata", "$top", "$filter"], ['Node'], {}),
    ("ogc-features-python", SAMPLES_REPO, "interop", "Read OGC API Features with Python", "Standard-library Python: discover a collection and read two GeoJSON features.", ["/collections", "/items"], ['Python'], {}),
    ("wms-getmap-check", SAMPLES_REPO, "interop", "Verify a WMS GetMap response", "Publish three points locally, enable WMS and check GetCapabilities and a real 317 x 241 GetMap PNG.", ["WMS GetCapabilities", "WMS GetMap"], ['Node'], {}),
    ("migration-workbench", SDK_REPO, "interop", "ArcGIS migration workbench", "Evidence viewer for honua-migrate output; the migrated app runs on the client-compat shims.", ["MapCompat", "MapViewCompat", "FeatureLayerCompat", "FeatureTableCompat", "PopupCompat"], ['TypeScript'], {}),
    ("geoservices-source-app", SDK_REPO, "interop", "GeoServices source app", "A tiny ArcGIS JS parcel viewer used as the input to the migration end-to-end test.", ["(ArcGIS JS API input)"], ['TypeScript'], {"status": "Test fixture"}),

    ("react-quickstart", SDK_REPO, "frameworks", "React quickstart", "The @honua/sdk-js/react bindings on an app-owned MapLibre map, published to Honua through HonuaMapProvider.", ["HonuaMapProvider", "useDataset", "useQuery", "useSelection", "useHover", "useCapabilities"], ['React'], {}),
    ("create-honua-app-react-ts", SAMPLES_REPO, "frameworks", "create-honua-app: react-ts", "Scaffold the react-ts starter and point it at a FeatureServer layer on your server.", ["npm create honua-app"], ['React'], {}),
    ("create-honua-app-vanilla-ts", SAMPLES_REPO, "frameworks", "create-honua-app: vanilla-ts", "Scaffold the vanilla-ts starter and point it at a FeatureServer layer on your server.", ["npm create honua-app"], ['TypeScript'], {}),
    ("runtime-parity-showcase", SDK_REPO, "frameworks", "Runtime parity showcase", "fetchMapPackage and loadMapPackage, a HonuaController, and web components for layers, legend, search, table and chart.", ["fetchMapPackage", "loadMapPackage", "createHonuaController", "createHonuaWebComponentControllerFromRuntime"], ['Web components'], {}),
    ("node-backend-quickstart", SDK_REPO, "frameworks", "Node.js backend quickstart", "A minimal Node HTTP service that uses the SDK from a backend process, without Express.", ["HonuaClient", "isHonuaError"], ['Node'], {}),
    ("plugin-endpoint", SAMPLES_REPO, "frameworks", "A public plugin endpoint", "Implement ICustomEndpoint from the Honua plugin contract and run it without a server.", ["ICustomEndpoint"], ['.NET'], {}),
]

REPOS = {SDK_REPO: ("honua-sdk-js", "examples"), SAMPLES_REPO: ("honua-samples", "samples")}


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout


def show(repo, path):
    try:
        return git(repo, "show", f"origin/trunk:{path}")
    except subprocess.CalledProcessError:
        return None


def ls(repo, path):
    try:
        return git(repo, "ls-tree", "-r", "--name-only", "origin/trunk", path).split()
    except subprocess.CalledProcessError:
        return []


def inline(md):
    out = html.escape(md, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", out)
    return out


def fenced_code(lines, index):
    language = lines[index][3:].split(" ")[0]
    index += 1
    block = []
    while index < len(lines) and not lines[index].startswith("```"):
        block.append(lines[index])
        index += 1
    return index, f'<pre data-lang="{html.escape(language)}">' + html.escape("\n".join(block[:18])) + "</pre>"


def markdown_table(lines, index):
    rows = []
    while index < len(lines) and lines[index].startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{2,}:?", cell) for cell in cells if cell):
            rows.append("<tr>" + "".join(f"<td>{inline(cell)}</td>" for cell in cells) + "</tr>")
        index += 1
    return index - 1, "<table><tbody>" + "".join(rows) + "</tbody></table>"


def render_readme(md, limit=70):
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    lines, out, index, paragraph, items = md.splitlines()[:limit * 2], [], 0, [], []
    def flush():
        if paragraph:
            out.append("<p>" + inline(" ".join(paragraph)) + "</p>")
            paragraph.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(item)}</li>" for item in items) + "</ul>")
            items.clear()
    while index < len(lines) and index < limit:
        line = lines[index].rstrip()
        if line.startswith("```") or line.startswith("|"):
            flush()
            index, block = fenced_code(lines, index) if line.startswith("```") else markdown_table(lines, index)
            out.append(block)
        elif re.match(r"^#{1,4} ", line):
            flush()
            level = len(line) - len(line.lstrip("#"))
            if level > 1:
                out.append(f"<h3>{inline(line[level + 1:])}</h3>")
        elif re.match(r"^\s*([-*]|\d+\.) ", line):
            if paragraph:
                flush()
            items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", line))
        elif not line.strip():
            flush()
        else:
            if items:
                flush()
            paragraph.append(line.lstrip("> "))
        index += 1
    flush()
    return "".join(out)


def trim_code(text, n=EXCERPT_LINES):
    lines = [l for l in text.splitlines() if not re.match(r'^import\s+["\'].*\.(css)["\'];?$', l) and "maplibre-vite-worker" not in l]
    while lines and not lines[0].strip():
        lines.pop(0)
    more = len(lines) > n
    body = "\n".join(lines[:n]).rstrip()
    return body + ("\n// …" if more else "")


def module_script(htmltext):
    m = re.search(r'<script type="module">(.*?)</script>', htmltext, re.S)
    if not m: return None
    return "\n".join(l[4:] if l.startswith("    ") else l for l in m.group(1).strip("\n").splitlines())


def first_source(repo, base, relative_paths):
    preferences = ["src/main.ts", "src/main.mjs", "src/App.tsx", "src/server.ts", "src/run.mjs", "src/run.py", "submit-buffer.py", "src/run.sh", "Program.cs", "src/index.html"]
    source = next((name for name in preferences if name in relative_paths), None)
    if not source:
        return []
    text = show(repo, f"{base}/{source}")
    script = module_script(text) if source.endswith(".html") else None
    return [{"name": "index.html · script" if script else source.split("/")[-1], "lang": "js" if script else {".ts":"ts", ".tsx":"tsx", ".mjs":"js", ".py":"py", ".sh":"sh", ".cs":"cs", ".html":"html"}.get(os.path.splitext(source)[1], "txt"), "code": trim_code(script or text)}]


def files_for(root, repo_kind, sid):
    repo_name, sub = REPOS[repo_kind]
    repo = os.path.join(root, repo_name)
    base = f"{sub}/{sid}"
    relative_paths = [name[len(base) + 1:] for name in ls(repo, base)]
    files = first_source(repo, base, relative_paths)
    for name in ("package.json", "sample.json", "requirements.txt"):
        if name in relative_paths:
            files.append({"name": name, "lang": "json" if name.endswith(".json") else "txt", "code": show(repo, f"{base}/{name}").strip()})
    return files, show(repo, f"{base}/README.md") or ""


def standalone_command(root, sample):
    metadata = show(os.path.join(root, REPOS[SAMPLES_REPO][0]), f"samples/{sample['id']}/sample.json")
    entry = json.loads(metadata).get("entrypoint", {}) if metadata else {}
    command = entry.get("command", "")
    if entry.get("build"):
        build = entry['build']
        return f"{build['command']} && npx serve {build['outputDir']}"
    return f"npx serve {os.path.dirname(command) or '.'}" if command.endswith(".html") else command


def run_command(root, sample, readme):
    create = re.search(r"npm create honua-app[^\n`]*", readme)
    if create:
        return create.group(0).strip()
    if sample["repo"] == SAMPLES_REPO:
        return standalone_command(root, sample)
    scripts = re.findall(r"npm run demo:[\w:-]+", readme)
    if scripts:
        return min(scripts, key=len)
    commands = [line.split("  #")[0].strip() for block in re.findall(r"```(?:bash|sh)\n(.*?)```", readme, re.S) for line in block.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    return commands[0] if commands else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Workspace containing honua-sdk-js and honua-samples")
    parser.add_argument("--output", required=True, help="Destination JSON snapshot")
    args = parser.parse_args()
    sdk_repo, samples_repo = (os.path.join(args.root, REPOS[k][0]) for k in (SDK_REPO, SAMPLES_REPO))
    revisions = {name: git(os.path.join(args.root, name), "rev-parse", "origin/trunk").strip()
                 for name in ("honua-sdk-js", "honua-samples", "honua-server")}
    out = []
    for sid, repo, cat, title, desc, apis, langs, extra in CATALOG:
        files, readme = files_for(args.root, repo, sid)
        repo_name, sub = REPOS[repo]
        run = run_command(args.root, {"repo": repo, "id": sid}, readme)
        for name, revision in revisions.items():
            for kind in ("tree", "blob"):
                readme = readme.replace(f"/{name}/{kind}/trunk/", f"/{name}/{kind}/{revision}/")
            readme = readme.replace(f"raw.githubusercontent.com/honua-io/{name}/trunk/",
                                    f"raw.githubusercontent.com/honua-io/{name}/{revision}/")
        out.append({
            "id": sid, "repo": repo, "cat": cat, "title": title, "desc": desc, "apis": apis,
            "path": f"{repo_name}/{sub}/{sid}", "url": f"https://github.com/honua-io/{repo_name}/tree/{git(os.path.join(args.root, repo_name), 'rev-parse', 'origin/trunk').strip()}/{sub}/{sid}",
            "run": run, "files": files, "langs": langs,
            "readme": render_readme(readme), **extra,
        })
    ids = {r[0] for r in CATALOG}
    for repo, sub in ((sdk_repo, "examples"), (samples_repo, "samples")):
        dirs = {p.split("/")[1] for p in ls(repo, sub) if p.count("/") >= 2} - {"_kit", "shared"}
        missing = dirs - ids
        if missing: raise SystemExit(f"Uncatalogued {sub} in {os.path.basename(repo)}: {sorted(missing)}")
    rev = lambda r: git(r, "log", "-1", "--format=%h %cs", "origin/trunk").strip()
    sdk_revision = revisions["honua-sdk-js"]
    doc = {"version": json.loads(show(sdk_repo, "package.json"))["version"], "sdkRev": rev(sdk_repo), "samplesRev": rev(samples_repo),
           "examplesIndex": f"https://github.com/honua-io/honua-sdk-js/blob/{sdk_revision}/examples/README.md",
           "categories": [{"id": c, "name": n} for c, n in CATEGORIES], "samples": out}
    dest = args.output
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} samples -> {os.path.relpath(dest)} ({os.path.getsize(dest) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
