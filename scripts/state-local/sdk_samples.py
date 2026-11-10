#!/usr/bin/env python3
"""Build data/13-sdk-samples.json for the SDK Explorer screen.

Reads examples from origin/trunk of honua-sdk-js and honua-samples (run `git fetch` in both first), so a stale
checkout never leaks into the gallery. Hand-written fields: category, title, one-line description, API names, live
preview id. Read from git: README (rendered to HTML), the main source file (trimmed) and package/sample metadata.

Usage: python3 -I sdk_samples.py --root /path/to/workspace --output /path/to/catalog.json
The workspace folder must hold both repositories with freshly fetched origin/trunk refs.
"""
import argparse, html, json, os, re, subprocess

DEMO_SERVER = "https://demo.honua.io"
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

# id, repo, category, title, description, API names, languages, extra
S, P = "sdk-js", "samples"
CATALOG = [
    ("maplibre-quickstart", S, "start", "First Map: endpoint to inspected map", "The canonical five-minute journey: connect, discover, explain, query and mount one source on MapLibre.", ["createHonua", "honua.connect", "connection.inspect", "connection.explain", "connection.query", "connection.mount", "maplibreRenderer"], ["TypeScript"], {"live": "firstmap"}),
    ("hello-featureserver-rest", P, "start", "Query a public FeatureServer", "Read three real Maui building features with plain fetch(). No account, key or SDK.", ["FeatureServer /query"], ["Node"], {}),
    ("browser-featureserver-query", P, "start", "Query a FeatureServer in the browser", "Discover a public FeatureServer layer and read three features with browser fetch(). No build step.", ["FeatureServer ?f=json", "FeatureServer /query"], ["HTML"], {}),
    ("oauth-signin", S, "start", "OAuth2 sign-in with PKCE", "Sign in with authorization code and PKCE against a mock identity provider, then call a bearer-protected API.", ["oauth2", "HonuaClient", "HonuaAuthError"], ["TypeScript"], {}),
    ("standalone-quickstart", S, "start", "Standalone quickstart", "Moved: the anonymous URL mode of First Map replaces it.", [], ["TypeScript"], {"status": "Moved", "moved": "maplibre-quickstart"}),
    ("endpoint-to-map", S, "start", "Endpoint to map", "Moved: consolidated into First Map.", [], ["TypeScript"], {"status": "Moved", "moved": "maplibre-quickstart"}),

    ("maplibre-featureserver-layer", P, "maps", "FeatureServer layer in MapLibre GL JS", "One HTML file loads a FeatureServer layer as GeoJSON, fits the map to it and opens a popup on click.", ["FeatureServer ?f=json", "FeatureServer /query f=geojson", "maplibregl.Map", "fitBounds", "maplibregl.Popup"], ["HTML"], {"live": "fslayer"}),
    ("maplibre-category-style-legend", P, "maps", "Category style and legend from OGC API Features", "Colour features by a category field with one match expression; the legend and popup use the same values.", ["/queryables", "/items", "match expression"], ["HTML"], {"live": "category"}),
    ("maplibre-ogc-tiles-mvt", P, "maps", "OGC API Tiles vector tiles in MapLibre", "Turn a tileset's templated link into a MapLibre vector source; Maui buildings extruded by render_height.", ["/tiles", "fill-extrusion"], ["HTML"], {}),
    ("pmtiles-static", S, "maps", "PMTiles static basemap", "A basemap from one .pmtiles archive on static hosting; the runtime registers pmtiles:// and reads the archive metadata.", ["describePmtilesArchive", "isPmtilesProtocolRegistered", "loadMapPackage", "HonuaClient"], ["TypeScript"], {}),
    ("storytelling-25d-map", S, "maps", "2.5D storytelling map", "A pitched corridor walkthrough: compatibility gating, OGC API Features extrusions, hover and selection.", ["HonuaClient.checkCompatibility", "ogcFeatures().collection().items()", "toMapLibreExtrusionLayer", "createHoverHandler", "createSelectionHandler"], ["TypeScript"], {}),
    ("terrain-rgb-elevation", S, "maps", "Terrain-RGB elevation", "Terrain-RGB tiles as hillshade and terrain, a point elevation lookup and a profile for a drawn line.", ["HonuaImageService", "decodeTerrainRgbElevation", "applyMapLibreScenePrimitives"], ["TypeScript"], {}),
    ("temporal-playback", S, "maps", "Temporal playback", "Animate a month of events with createTemporalPlayback, styled by a classBreaksRenderer and its legend.", ["createTemporalPlayback", "classBreaksRenderer", "renderer.legendItems"], ["TypeScript"], {}),
    ("imagery-cog-quickstart", S, "maps", "Imagery and terrain journey", "Search STAC by extent, date and cloud cover, open a COG on MapLibre and sample an elevation profile.", ["connect", "HonuaClient.stac().search", "openStacCogAsset", "mountStacCogAssetToMapLibre", "sampleElevationProfile"], ["TypeScript"], {}),

    ("maui-311", P, "maps", "311 operations", "Labelled service-request exercises over public Maui geography.", ["HonuaClient"], ["JavaScript"], {}),
    ("maui-property-planning", P, "query", "Property and planning", "Parcel lookup and public planning overlays, with source attribution.", ["HonuaClient"], ["JavaScript"], {}),
    ("maui-emergency", P, "maps", "Emergency preparedness exercise", "Public geography and explicitly fictional shelter and road-status records.", ["HonuaClient"], ["JavaScript"], {}),
    ("maui-public-works", P, "maps", "Public works assets", "Public road and bridge sources with labelled inspection exercises.", ["HonuaClient"], ["JavaScript"], {}),
    ("county-parcel-viewer", P, "query", "County parcel viewer", "Find a parcel by TMK, address or click and see the zoning and FEMA flood zones that cover it, with shares.", ["connect", "QueryBuilder", "HonuaGeocodingClient", "esriGeometryToGeoJSON", "registerPmtilesSource"], ["TypeScript"], {}),
    ("geocoding-quickstart", S, "query", "Address to pin", "One HonuaGeocodingClient.forwardGeocode() request; the chosen candidate becomes a synchronized MapLibre pin.", ["HonuaGeocodingClient", "forwardGeocode"], ["TypeScript"], {}),
    ("geocode-single-line", P, "query", "Geocode one address", "Send one anonymous request to a GeocodeServer and print the best candidate.", ["GeocodeServer findAddressCandidates"], ["Node"], {}),
    ("columnar-query-quickstart", S, "query", "Map a bounded Arrow result", "Plan a FeatureServer f=arrow request and decode one bounded GeoArrow batch for MapLibre.", ["openColumnarSession", "createApacheArrowResponseDecoder", "ColumnarWorkflowError"], ["TypeScript"], {}),
    ("overture-geoparquet", S, "query", "Overture columnar lab", "A protocol-neutral spatial query on GeoParquet through DuckDB-WASM, with one bounded policy.", ["GeoparquetRuntime", "createBrowserDuckDbDriver", "geoparquetResolver", "createDataset"], ["TypeScript"], {}),

    ("sketch-editing", S, "edit", "Sketch editing with terra-draw", "Draw, edit and delete through one edit-sketch workflow with snapping, undo and redo, then applyEdits.", ["createEditSketchWorkflow", "createSnapIndex", "createTerraDrawSketch", "terraDrawSketchToolCapabilities", "workflow.submit"], ["TypeScript"], {"live": "sketch"}),
    ("planning-permitting-workbench", S, "edit", "Planning and permitting journey", "Find a parcel, check metadata, run bounded analysis, submit or recover an edit with attachments, export.", ["createHonua", "createEditSession", "createFeatureEditorWorkflow", "bindChartToExploration", "bindMapExtentToExploration", "intersect", "area"], ["TypeScript"], {}),
    ("edit-workflow-demo", S, "edit", "Edit workflow demo", "Compatibility sample; the planning and permitting journey now owns the full edit workflow.", ["createEditSession", "createEditSketchWorkflow", "createSnapIndex", "resolveSnapCandidate"], ["TypeScript"], {"status": "Replacement planned", "moved": "planning-permitting-workbench"}),

    ("spatial-analytics-workbench", S, "analysis", "Linked spatial analysis workbench", "Explain, accept, execute: one query plan links the area, the filter, the map, the table and the chart.", ["createExplorationContext", "connectView", "setAggregation", "setFilter", "selectLinkedViewQueryProjection", "explainQuery"], ["TypeScript"], {"live": "linked"}),
    ("realtime-incident-dashboard", S, "analysis", "Realtime incident dashboard", "Uses the server stream when advertised, else a visible read-only replay; map, filters, queue and metrics stay linked.", ["createHonuaServerRealtimeSubscription", "createRealtimeFeatureStore", "bindFilterControlsToExploration", "syncMapLayerFilterToExploration", "uniqueValueRenderer"], ["TypeScript"], {}),
    ("kepler-analytics", S, "analysis", "Kepler analytics", "Retired in September 2026; the page stays for an archived consumer card.", [], ["TypeScript"], {"status": "Retired"}),

    ("geoprocessing-job-runner", S, "gp", "Run a buffer job and collect the result", "Execute geometry.buffer through OGC API Processes, follow the job and read its output.", ["HonuaClient", "ogcProcesses().execute", "job.result"], ["TypeScript"], {}),
    ("gp-local-dev", P, "gp", "Local geoprocessing with the Python SDK", "Submit and verify a 500 m planar buffer with the published Python SDK.", ["honua_sdk.HonuaClient", "client.geoprocessing()"], ["Python"], {}),
    ("gp-process-templates", P, "gp", "GP process templates", "Executable evidence for the Python and .NET process templates against the custom-code contract.", ["custom-code worker contract"], ["Python", ".NET"], {}),
    ("maui-data-pipeline", P, "gp", "Maui department data pipeline", "Import department data into a disposable local Honua Server through the admin REST API.", ["admin REST imports"], ["Node"], {}),

    ("nl-map-control", S, "ai", "Ask this map", "Review a schema-grounded spatial query, approve it, then see the same returned IDs on the map and in the table.", ["createAskMapSession", "createNlMapControl", "mountAskMapControl", "session.invalidate", "compileSemanticDuckDbQuery"], ["TypeScript"], {"live": "nl", "status": "Experimental"}),
    ("ai-spatial-app-builder", S, "ai", "Safe agent workbench", "An agent proposes spatial work; the SDK authorizes the effect with a dry run, an approval and a verifiable receipt.", ["dryRunAgentPlan", "issueAgentApproval", "verifyAgentStepAuthorization", "issueAgentExecutionReceipt", "explainQuery"], ["TypeScript"], {}),
    ("mcp-gis-assistant", S, "ai", "MCP GIS assistant", "Grounded discovery of services, layers and schemas with review-before-apply filters and raw tool-call diagnostics.", ["createExplorationContext", "createHonuaAppWorkspace", "selectHonuaAppWorkspaceDrafts"], ["TypeScript"], {}),

    ("service-explorer", S, "interop", "Universal GIS service explorer", "Paste a service root, inspect discovery evidence and run only operations both the endpoint and the planner accept.", ["createHonua", "explainAutomaticSourceToMapLibre", "mountAutomaticSourceToMapLibre", "executeQueryPlan"], ["TypeScript"], {}),
    ("coverages-wcs-basic", S, "interop", "Coverages and WCS", "OGC API Coverages and WCS 2.0.1 clients side by side, both mounted as MapLibre raster layers.", ["createCoverageClient", "createWcsClient", "coverageToMapLibreImage"], ["TypeScript"], {}),
    ("stac-imagery-browser", S, "interop", "Find recent Maui imagery", "Search a bounded Maui STAC API, page the results, preview a scene and hand the asset to the right SDK surface.", ["createDynamicStacClient", "HonuaClient.stac", "inspectPmtilesArchive"], ["TypeScript"], {}),
    ("stac-search-rest", P, "interop", "Discover a public STAC catalog", "Read the STAC root and collections and report which can be explored further.", ["STAC /collections"], ["Node"], {}),
    ("stac-ops", P, "interop", "STAC operations dashboard", "A Blazor WebAssembly dashboard for a Honua STAC catalog: validators, extensions, query probes and timing.", ["STAC API"], [".NET"], {}),
    ("odata-query-rest", P, "interop", "Read spatial features with OData v4", "Discover one public layer and read three features through OData with plain fetch().", ["OData $metadata", "$top", "$filter"], ["Node"], {}),
    ("ogc-features-python", P, "interop", "Read OGC API Features with Python", "Standard-library Python: discover a collection and read two GeoJSON features.", ["/collections", "/items"], ["Python"], {}),
    ("wms-getmap-check", P, "interop", "Verify a WMS GetMap response", "Publish three points locally, enable WMS and check GetCapabilities and a real 317 x 241 GetMap PNG.", ["WMS GetCapabilities", "WMS GetMap"], ["Node"], {}),
    ("esri-leaflet-featurelayer", P, "interop", "Stock esri-leaflet FeatureLayer on Honua", "Unmodified Leaflet and esri-leaflet draw a filtered Honua FeatureServer layer with popups.", ["L.esri.featureLayer"], ["HTML"], {}),
    ("migration-workbench", S, "interop", "ArcGIS migration workbench", "Evidence viewer for honua-migrate output; the migrated app runs on the client-compat shims.", ["MapCompat", "MapViewCompat", "FeatureLayerCompat", "FeatureTableCompat", "PopupCompat"], ["TypeScript"], {}),
    ("geoservices-source-app", S, "interop", "GeoServices source app", "A tiny ArcGIS JS parcel viewer used as the input to the migration end-to-end test.", ["(ArcGIS JS API input)"], ["TypeScript"], {"status": "Test fixture"}),

    ("react-quickstart", S, "frameworks", "React quickstart", "The @honua/sdk-js/react bindings on an app-owned MapLibre map, published to Honua through HonuaMapProvider.", ["HonuaMapProvider", "useDataset", "useQuery", "useSelection", "useHover", "useCapabilities"], ["React"], {}),
    ("create-honua-app-react-ts", P, "frameworks", "create-honua-app: react-ts", "Scaffold the react-ts starter and point it at a FeatureServer layer on your server.", ["npm create honua-app"], ["React"], {}),
    ("create-honua-app-vanilla-ts", P, "frameworks", "create-honua-app: vanilla-ts", "Scaffold the vanilla-ts starter and point it at a FeatureServer layer on your server.", ["npm create honua-app"], ["TypeScript"], {}),
    ("runtime-parity-showcase", S, "frameworks", "Runtime parity showcase", "fetchMapPackage and loadMapPackage, a HonuaController, and web components for layers, legend, search, table and chart.", ["fetchMapPackage", "loadMapPackage", "createHonuaController", "createHonuaWebComponentControllerFromRuntime"], ["Web components"], {}),
    ("node-backend-quickstart", S, "frameworks", "Node.js backend quickstart", "A minimal Node HTTP service that uses the SDK from a backend process, without Express.", ["HonuaClient", "isHonuaError"], ["Node"], {}),
    ("plugin-endpoint", P, "frameworks", "A public plugin endpoint", "Implement ICustomEndpoint from the Honua plugin contract and run it without a server.", ["ICustomEndpoint"], [".NET"], {}),
]

REPOS = {S: ("honua-sdk-js", "examples"), P: ("honua-samples", "samples")}


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


def point_at_demo(text):
    return text.replace("https://demo.honua.io", DEMO_SERVER)


def inline(md):
    out = html.escape(md, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", out)
    return out


def render_readme(md, limit=70):
    md = re.sub(r"<!-- sample-playground:start -->.*?<!-- sample-playground:end -->", "", md, flags=re.S)
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    lines, out, i, para, lst = md.splitlines()[:limit * 2], [], 0, [], None

    def flush():
        nonlocal para, lst
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if lst:
            tag = lst[0]; out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in lst[1]) + f"</{tag}>"); lst = None

    count = 0
    while i < len(lines) and count < limit:
        ln = lines[i].rstrip(); count += 1
        if ln.startswith("```"):
            flush(); lang = ln[3:].split(" ")[0]; i += 1; block = []
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i]); i += 1
            out.append(f'<pre class="md-code" data-lang="{html.escape(lang)}">' + html.escape(point_at_demo("\n".join(block[:18]))) + "</pre>")
        elif re.match(r"^#{1,4} ", ln):
            flush(); lvl = len(ln) - len(ln.lstrip("#")); tag = "h3" if lvl <= 2 else "h4"
            if lvl > 1: out.append(f"<{tag}>{inline(ln[lvl + 1:])}</{tag}>")
        elif ln.startswith("|"):
            flush(); rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c): rows.append(cells)
                i += 1
            i -= 1
            body = "".join("<tr>" + "".join(f"<td>{inline(point_at_demo(c))}</td>" for c in r) + "</tr>" for r in rows if any(r))
            out.append(f'<table class="md-tbl"><tbody>{body}</tbody></table>')
        elif re.match(r"^\s*([-*]|\d+\.) ", ln):
            if para: flush()
            tag = "ol" if re.match(r"^\s*\d+\.", ln) else "ul"
            if not lst: lst = (tag, [])
            lst[1].append(re.sub(r"^\s*([-*]|\d+\.) ", "", ln))
        elif ln.startswith("  ") and lst:
            lst[1][-1] += " " + ln.strip()
        elif ln.startswith(">"):
            para.append(ln.lstrip("> "))
        elif not ln.strip():
            flush()
        else:
            if lst: flush()
            para.append(point_at_demo(ln.strip()))
        i += 1
    flush()
    return "".join(out)


def trim_code(text, n=EXCERPT_LINES):
    lines = [l for l in text.splitlines() if not re.match(r'^import\s+["\'].*\.(css)["\'];?$', l) and "maplibre-vite-worker" not in l]
    while lines and not lines[0].strip():
        lines.pop(0)
    more = len(lines) > n
    body = "\n".join(lines[:n]).rstrip()
    return point_at_demo(body + ("\n// …" if more else ""))


def module_script(htmltext):
    m = re.search(r'<script type="module">(.*?)</script>', htmltext, re.S)
    if not m: return None
    return "\n".join(l[4:] if l.startswith("    ") else l for l in m.group(1).strip("\n").splitlines())


def lang_of(name):
    ext = name.rsplit(".", 1)[-1]
    return {"ts": "ts", "tsx": "ts", "mjs": "js", "js": "js", "json": "json", "py": "py", "sh": "sh", "cs": "cs", "html": "html", "http": "sh"}.get(ext, "txt")


def files_for(root, repo_kind, sid):
    repo_name, sub = REPOS[repo_kind]
    repo = os.path.join(root, repo_name); base = f"{sub}/{sid}"
    tree = ls(repo, base); rel = [p[len(base) + 1:] for p in tree]
    files = []
    prefs = ["src/main.ts", "src/App.tsx", "src/server.ts", "src/run.mjs", "src/run.py", "submit-buffer.py", "src/run.sh", "Program.cs", "src/index.html"]
    for p in prefs:
        if p in rel:
            text = show(repo, f"{base}/{p}")
            if p.endswith(".html"):
                script = module_script(text)
                if script:
                    files.append({"name": "index.html · script", "lang": "js", "code": trim_code(script)}); break
                files.append({"name": p.split("/")[-1], "lang": "html", "code": trim_code(text)}); break
            files.append({"name": p.split("/")[-1], "lang": lang_of(p), "code": trim_code(text)}); break
    for meta in ("package.json", "sample.json", "requirements.txt"):
        if meta in rel:
            t = show(repo, f"{base}/{meta}")
            files.append({"name": meta, "lang": lang_of(meta), "code": point_at_demo(t.strip())})
    return files, rel, show(repo, f"{base}/README.md") or ""


def run_command(root, repo_kind, sid, readme):
    create = re.search(r"npm create honua-app[^\n`]*", readme)
    if create: return create.group(0).strip()
    if repo_kind == P:
        meta = show(os.path.join(root, REPOS[P][0]), f"samples/{sid}/sample.json")
        cmd = json.loads(meta).get("entrypoint", {}).get("command", "") if meta else ""
        return f"npx serve {os.path.dirname(cmd) or '.'}" if cmd.endswith(".html") else cmd
    scripts = re.findall(r"npm run demo:[\w:-]+", readme)
    if scripts: return min(scripts, key=len)
    for block in re.findall(r"```(?:bash|sh)\n(.*?)```", readme, re.S):
        for line in block.splitlines():
            if line.strip() and not line.lstrip().startswith("#"): return line.split("  #")[0].strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="Workspace containing honua-sdk-js and honua-samples")
    ap.add_argument("--output", required=True, help="Destination JSON snapshot")
    a = ap.parse_args()
    sdk_repo, samples_repo = (os.path.join(a.root, REPOS[k][0]) for k in (S, P))
    playgrounds = {p.split("/")[1] for p in ls(sdk_repo, "playgrounds") if p.count("/") >= 2}
    out = []
    for sid, repo, cat, title, desc, apis, langs, extra in CATALOG:
        files, rel, readme = files_for(a.root, repo, sid)
        repo_name, sub = REPOS[repo]
        run = run_command(a.root, repo, sid, readme)
        out.append({
            "id": sid, "repo": repo, "cat": cat, "title": title, "desc": desc, "apis": apis, "langs": langs,
            "path": f"{repo_name}/{sub}/{sid}", "url": f"https://github.com/honua-io/{repo_name}/tree/{git(os.path.join(a.root, repo_name), 'rev-parse', 'origin/trunk').strip()}/{sub}/{sid}",
            "playground": sid in playgrounds, "run": point_at_demo(run), "files": files,
            "readme": render_readme(readme), **extra,
        })
    ids = {r[0] for r in CATALOG}
    for repo, sub in ((sdk_repo, "examples"), (samples_repo, "samples")):
        dirs = {p.split("/")[1] for p in ls(repo, sub) if p.count("/") >= 2} - {"_kit", "shared"}
        missing = dirs - ids
        if missing: raise SystemExit(f"Uncatalogued {sub} in {os.path.basename(repo)}: {sorted(missing)}")
    rev = lambda r: git(r, "log", "-1", "--format=%h %cs", "origin/trunk").strip()
    doc = {"version": json.loads(show(sdk_repo, "package.json"))["version"], "server": DEMO_SERVER, "sdkRev": rev(sdk_repo), "samplesRev": rev(samples_repo),
           "categories": [{"id": c, "name": n} for c, n in CATEGORIES], "samples": out}
    dest = a.output
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} samples -> {os.path.relpath(dest)} ({os.path.getsize(dest) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
