# Honua developer examples and SDK gap plan

Status: working product plan

Research date: 2026-08-08

## Decision summary

1. Keep `honua-samples`. Make it the public home for three clearly separated content types: Examples, Walkthroughs, and Projects.
2. Rename `honua-demo` to `honua-demo-environment` or `honua-demo-infrastructure`. It contains Terraform, seed data, a service manifest, canaries, and runbooks. It does not contain demo application code.
3. Keep `samples.honua.io` as the public developer gallery. Make `sample.honua.io` redirect to it.
4. Keep `demo.honua.io` as the public API environment. Add a useful root landing response that explains the environment and links to its service manifest, health, documentation, and samples.
5. Do not create one repository per content type. One catalog, one build, and one deployment gate are materially easier to keep working.
6. Stop publishing qualification apps as if they were beginner examples. A large SDK app can remain a tested Project, but it must be paired with a small Example and an incremental Walkthrough.
7. Prioritize SDK gaps that unlock already-shipping Honua Server capability before copying the long tail of competitor renderer effects or proprietary domain workflows.

## Research inventory

The machine-readable inventory is in [`competitor-example-inventory.json`](./competitor-example-inventory.json). It records every unique route observed in the official indexes and assigns a broad Honua disposition for portfolio planning.

| Source | Observed inventory | What it teaches |
|---|---:|---|
| ArcGIS Maps SDK for JavaScript | 379 unique sample routes and 43 walkthroughs | A deep capability taxonomy, focused sample pages, incremental tutorials, built-in components, and a very broad 2D/3D surface |
| Mapbox GL JS | 163 examples and 27 GL JS tutorials | Very small visual recipes, immediate live output, code beside the result, strong search/filtering, and framework tutorials |
| CARTO for Developers | 33 examples across 13 sections | A smaller catalog organized around analytics outcomes, large-scale data, spatial indexes, widgets, and complete deck.gl applications |
| ArcGIS AppStudio samples | 92 project folders on the `v5.5` branch | A useful structural reference for complete applications, but not a current JavaScript SDK capability baseline |

Official sources:

- <https://developers.arcgis.com/javascript/latest/sample-code/>
- <https://developers.arcgis.com/javascript/latest/tutorials/>
- <https://docs.mapbox.com/mapbox-gl-js/example/>
- <https://docs.mapbox.com/help/tutorials/?product=Mapbox+GL+JS>
- <https://docs.carto.com/carto-for-developers/examples>
- <https://github.com/Esri/arcgis-appstudio-samples>

## What the competitors do better

### ArcGIS

ArcGIS has a coherent progression from get-started material to 43 guided tutorials and hundreds of narrowly named samples. Its taxonomy exposes capability depth directly: maps, scenes, layers, queries, editing, labels, draw, visualization, popups, routing, search, time, analysis, and components.

The strongest presentation behavior is not merely quantity. A sample such as Intro to MapView breaks the code into named steps and keeps the relevant code on the page. Developers do not have to infer the learning objective from a full application entrypoint.

ArcGIS also has real product depth that Honua does not currently match: mature scenes, point clouds, voxel data, BIM/buildings, utility networks, knowledge graphs, viewsheds, weather, advanced imagery renderers, smart mapping, and a broad component library.

### Mapbox

Mapbox focuses on one visible result per example. Its examples are usually easy to scan by title and can be understood without first learning a project architecture. The live map and code are adjacent. Related tutorials and examples are linked from each detail page.

Mapbox is especially strong in camera behavior, user interaction, source/layer mechanics, expressions, labels, symbols, terrain, 3D buildings, atmosphere, projections, and framework integration. Many of those are renderer recipes rather than proprietary platform capabilities, which means Honua can support equivalent learning outcomes through MapLibre without manufacturing unnecessary SDK wrappers.

### CARTO

CARTO has a much smaller example set, but its grouping is clear and outcome-oriented: live SQL, dynamic tiling, H3, Quadbin, heatmaps, trips, raster, widgets, named sources, and editable spatial masks. The examples are complete Vite applications in GitHub rather than tiny inline snippets.

CARTO's strength is a coherent warehouse-to-visualization story. Honua has many of the necessary primitives in columnar, GeoParquet, GeoArrow, Deck.gl, Kepler, accessible tables, linked state, and spatial aggregation, but presents them as isolated qualification apps rather than a progressive analytics curriculum.

### AppStudio

AppStudio is not the right API comparison because it is a QML/native application repository. It is useful as a content-shape reference. Each folder represents a complete application such as offline routing, feature attachments, geofencing, viewshed, or feature editing.

The lesson is to label complete applications as Projects. They should not share the same visual or metadata contract as a 20-line Example.

## Current Honua platform truth

### Server strengths

Honua Server already exposes one shared capability set through GeoServices REST, OGC API Features, Tiles, Maps, Coverages, Records, Styles, and Processes, WFS, WMS, WMTS, WCS, OData, STAC, MVT/TileJSON, PMTiles, MCP, and gRPC.

The server's strongest differentiated data paths are:

- COG registration and range-backed serving through ImageServer, WCS, and OGC API Coverages.
- A STAC API with collection and item discovery plus GET/POST search, CQL2, field projection, and sorting.
- Immediate MVT delivery, tile-cache operations, and durable PMTiles v3 publishing.
- GeoParquet 1.1 and GeoArrow/Arrow IPC query output.
- GeoJSON, CSV, GML, PBF, FlatGeobuf, Geobuf, GeoPackage, and Shapefile export paths.
- Terrain-RGB and elevation services.
- PostGIS, DuckDB analytics, SQL Server, and MySQL/MariaDB provider paths.
- Full OGC CITE evidence for the currently claimed conformance profiles.

Multidimensional support needs precise maturity labels:

- Zarr has registration and metadata management. A newer datacube tile slice surface has implementation evidence, while the public protocol overview still says protocol serving is not exposed. Treat it as experimental until those contracts agree and a public sample can pass against a seeded service.
- Cloud-optimized HDF5, NetCDF-4, and GRIB can be registered today. Current publishing documentation says metadata extraction and subset reads depend on a follow-up reader. They are not production client capabilities yet.

### JavaScript SDK strengths

The SDK already contains substantial capability that is not visible in the public gallery:

- Unified connection, discovery, capability evaluation, query planning, and execution receipts.
- GeoServices, OGC, WFS, WMS/WMTS, OData, gRPC, PMTiles, static STAC, and MapLibre adapters.
- COG range transport and a STAC-to-COG session.
- GeoParquet, GeoArrow, Arrow interop, columnar workers, aggregation, projection, patching, and IndexedDB caching.
- MapLibre, Deck.gl, Kepler, React, web component, and Cesium scene-workspace integration.
- Basemap, layer-list, legend, swipe, feature-table, editor, measurement, and time-slider controls.
- Geometry, projection, expressions, styling, temporal playback, realtime, offline regions, edit replay, collaboration, replica sync, saved workspaces, and diagnostics.
- OAuth/PKCE, client credentials, API key, bearer, and browser credential safety primitives.
- AI tool definitions, MCP/OpenAI conversion, agent planning, approval, authorization, and execution receipts.

The generated SDK coverage document currently records 33 canonical capability keys. Nineteen are covered and fourteen are partial. Important partial claims include agent execution, MCP discovery, collaboration, capability manifests, offline sync, geoprocessing, GeometryServer, ImageServer, OGC Maps, OGC Records, OGC Tiles, realtime subscriptions, and COG consumption.

### Public sample surface

The public gallery currently combines seven small protocol samples with a projected set of large SDK applications. The most visible SDK samples are technically qualified, but many are too large to teach one concept. The First Map detail page, for example, shows a full application entrypoint rather than a minimal connection and layer-mount sequence.

The result is a catalog that proves implementation but does not teach it efficiently.

### Demo environment

`honua-demo` publishes `https://demo.honua.io/demo-services.v1.json`. Its current seed tells a coherent Maui story across parcels, zoning, roads, flood hazard, sea-level rise, place names, buildings, hillshade, terrain, imagery, PMTiles, and STAC.

That manifest should become the only source for public live sample endpoints. Samples should not hand-code service URLs that drift independently from the environment.

The demo environment does not currently advertise public geocoding, routing, realtime, writable editing, WCS/Coverages, Zarr, NetCDF, or GeoParquet/GeoArrow services. Those omissions limit which SDK walkthroughs can have a real anonymous live lane.

## Repository naming and ownership

### Recommended names

| Current name | Recommendation | Reason |
|---|---|---|
| `honua-samples` | Keep | The name is familiar and broad enough if the site navigation clearly separates Examples, Walkthroughs, and Projects. Renaming creates URL and workflow churn without fixing the information architecture. |
| `honua-demo` | Rename to `honua-demo-environment` | The repository contains live environment infrastructure and operations, not application demos. The new name communicates the safety boundary. |
| `demo.honua.io` | Keep, add a landing response | It is already an API base URL. A useful root response can explain that fact without breaking clients. |
| `samples.honua.io` | Keep | It accurately describes the public developer gallery. |

### Ownership contract

| Repository | Owns | Does not own |
|---|---|---|
| `honua-samples` | Public examples, walkthrough source, project source, catalog metadata, gallery rendering, source viewer, live/fixture receipts, and deployment gates | Live cloud infrastructure or SDK implementation |
| `honua-sdk-js` | SDK code, API reference, starter templates, contract tests, and qualification fixtures/apps | The public information architecture or production sample deployment |
| `honua-demo-environment` | Terraform, seed provenance, `demo-services.v1.json`, endpoint canaries, quotas, and environment runbooks | Public application source |
| `honua-server` | Protocol and operation implementation, OpenAPI, seed contracts, conformance, and server guides | Browser sample presentation |
| `honua-site` | Product documentation, conceptual guides, and links into the sample catalog | A second copy of runnable sample code |

GitHub redirects make a repository rename manageable, but Terraform references, workflow allowlists, OIDC subjects, badges, and release metadata still need an explicit migration checklist. Do not rename the live DNS name or move application code into the environment repository.

## SDK product gaps, prioritized

This is the product gap list, not the documentation backlog. A missing example is not automatically a missing SDK capability.

### P0: close server-to-client gaps and everyday mapping gaps

| Gap | Why it is P0 | Required outcome |
|---|---|---|
| OGC API Coverages and WCS client | The server has a differentiated, conformant raster/coverage surface, but the JS SDK has no first-class connector. | Add coverage discovery, domain/range metadata, subset requests, cancellation, typed errors, output selection, and MapLibre image/terrain handoff. |
| Executable geometry and geoprocessing | Current generated coverage says GeometryServer and geoprocessing are metadata/discovery partials. | Add typed execute/submit, job polling, cancellation, result retrieval, and progress receipts across GeometryServer, GPServer, and OGC API Processes. |
| Coherent renderer and layer presentation API | Esri, Mapbox, and CARTO all make styling and interaction central. Honua has style and renderer primitives but not one obvious path from query result to styled, labeled, interactive layer. | Productize categorical, class-break, continuous, label, popup/detail, cluster, heatmap, legend, selection, and accessible summary flows. Use MapLibre expressions directly where appropriate. |
| Capability truth alignment | Server docs, SDK coverage, demo seeds, and sample publication can disagree. Zarr is a current example of conflicting maturity signals. | Generate one joined server/SDK/demo/sample capability matrix with `supported`, `partial`, `preview`, and `planned` states and hard evidence links. |
| Stable demo discovery contract | Hand-coded URLs caused a published failure. | Add an SDK helper that consumes `demo-services.v1.json` or the same schema on any Honua deployment; build samples from pinned manifest data and verify live canaries before publication. |
| Beginner API path | First Map works as a qualification app but is not teachable. | Establish one supported 15-30 line connect, inspect, query, mount, and dispose path. Treat complexity outside that path as an API ergonomics defect or advanced project concern. |

### P1: complete Honua's differentiated workflows

| Gap | Current position | Required outcome |
|---|---|---|
| STAC API client depth | STAC discovery exists and a browser project exists, but static STAC and fixture behavior dominate the public story. | Cover GET/POST search, CQL2, fields, sort, paging, asset roles, collection links, signed assets, and STAC-to-COG sessions against the live server. |
| ImageServer and raster operations | Metadata and query-capable ImageServer paths exist; export-only operations remain partial. | Add export, identify, statistics, band/raster function inputs, pixel/band metadata, and clear unsupported capability handling. |
| PMTiles publishing lifecycle | PMTiles consumption is strong; server publishing is an admin/job workflow. | Add typed publish/archive job helpers, progress, artifact rotation, range-proxy consumption, and a publish-to-browser walkthrough. |
| GeoParquet/GeoArrow end-to-end flow | Server output and client columnar support are unusually strong, but the experience is split across large labs. | Add bounded query-to-Arrow, worker transfer, aggregation, reprojection, Deck.gl/Kepler rendering, cache, and export recipes. |
| Analytics widgets | The SDK has linked state, aggregation, accessible table, and adapter primitives. CARTO exposes polished outcome widgets. | Ship composable formula, categories, histogram, range, table, time-series, and spatial-filter models with accessible presentation contracts. |
| Geocoding and routing | SDK providers exist, but public live service coverage and tutorial depth are weak. Routing depth does not match Esri or Mapbox. | Seed quota-limited demo services or deterministic fixtures, then support forward/reverse/suggest, route/directions, and later service areas and optimization. |
| Editing plus offline sync | Editing, offline regions, queues, replay, conflict tools, collaboration, and replica sync exist separately. Generated coverage correctly calls field-data sync partial. | Define one end-to-end edit/sync contract including forms, attachments, conflicts, retries, offline credentials, and accessible status. |
| Authentication deployment patterns | Auth primitives exist but safe browser/server boundaries are not obvious from samples. | Publish supported API-key, OAuth/PKCE, bearer, client-credential backend, token refresh, redaction, and multi-tenant examples. |
| Realtime end-to-end flow | SSE, WebSocket, OData delta, checkpoints, reconciliation, and an incident project exist. The canonical claim remains partial. | Stabilize reconnect, resume, dedupe, backpressure, checkpoint storage, selection reconciliation, and cross-transport semantics. |

### P2: expand strategically after P0/P1

| Gap | Recommendation |
|---|---|
| Zarr | Promote only after the server's public contract, docs, seed, and evidence agree. Then add metadata discovery, variable/axis selection, time/elevation slices, tile rendering, and worker-backed array access. |
| NetCDF/HDF5/GRIB | Do not publish a runnable client sample while the server only supports registration or build-optional readers. First ship real metadata and subset reads, then add a coverage-oriented SDK adapter rather than format-specific UI. |
| 3D baseline | Support terrain, 3D buildings, camera synchronization, selection, and temporal state through Cesium. These serve the Maui data story and common customer needs. |
| Framework starters | Maintain vanilla TypeScript and React first. Add Vue, Svelte, and Angular only with generated templates and owned CI. Core examples stay framework-neutral. |
| Content/save/share | Build on web-map parsing, saved workspaces, collaboration, and Studio publishing. Be explicit that this is not full ArcGIS Portal parity. |
| Localization and accessibility | Make locale, number/date formatting, keyboard navigation, screen-reader summaries, high contrast, reduced motion, and RTL testable sample dimensions. |

### P3: do not chase without customer demand

Defer Gaussian splats, voxel editing, BIM/building exploration, advanced point-cloud rendering, utility-network tracing UI, knowledge-graph editing, weather effects, Mars/planet scenes, and the long tail of proprietary ArcGIS widgets.

Mapbox rain, snow, fog, custom shader, and highly specific style effects should normally remain MapLibre or renderer recipes, not new Honua SDK abstractions.

## Documentation and sample gaps

These are high priority even when no SDK code is missing:

| Existing capability | Current problem | Content needed |
|---|---|---|
| Controls and web components | Basemap, layer list, legend, swipe, measurement, time slider, feature table, and editor are largely invisible. | One atomic Example per component plus one components Walkthrough. |
| Geometry and projection | API exists, but developers cannot quickly find common buffer, intersect, area, distance, and projection flows. | One operation per Example and one analysis Walkthrough. |
| Query planner | Strong internal capability is hidden behind large apps. | SQL, spatial, paging, statistics, extent, cancellation, and explain-plan Examples. |
| COG, STAC, PMTiles | Existing Projects are too large or fixture-centric. | Small source/connect/render Examples and end-to-end publishing Walkthroughs. |
| Offline, collaboration, saved workspaces | Strong primitives have no coherent public journey. | Offline map Walkthrough and Field Operations Project. |
| AI safety | Differentiated functionality is bundled into labs. | Inspect, tool schema, plan, approve, execute, receipt, and provider-adapter Examples. |
| Migration | Workbench exists, but the small migration tasks are not teachable independently. | Web map conversion, renderer conversion, endpoint swap, and parity-check Examples. |

## Public information architecture

### Examples

Purpose: answer one question with the smallest working code.

Contract:

- One concept.
- Prefer 15-40 relevant lines.
- Inline code is the primary source view.
- Live result beside the code.
- Copy, download, and open-in-StackBlitz actions.
- No unexplained project scaffolding.
- Deterministic fixture lane plus a bounded live lane when possible.
- A semantic browser assertion, not only a 200 response.

URL shape: `/examples/{slug}/`

### Walkthroughs

Purpose: teach a complete task through incremental milestones.

Contract:

- A stated outcome and prerequisites.
- Five to ten named steps.
- Code diffs at each step.
- A runnable checkpoint at meaningful milestones.
- A final complete application.
- Troubleshooting and capability-degradation notes.
- A next-step link to related Examples and Projects.

URL shape: `/walkthroughs/{slug}/`

### Projects

Purpose: show production-shaped composition and architecture.

Contract:

- Full application with its own README and architecture notes.
- Live full-screen application.
- File tree and multi-file source viewer.
- GitHub, download, and local-run actions.
- Explicit backend, authentication, license, and data prerequisites.
- Desktop and mobile screenshots.
- Fixture and live evidence receipts.
- No claim that the project is a minimal quickstart.

URL shape: `/projects/{slug}/`

### Reference playgrounds

API reference pages may embed a compact playground, but the public catalog should point at the canonical Example. Do not fork the source into a second documentation tree.

## Comprehensive curriculum

### Track 1: start and connect

Examples: display a map, create a client, connect from a URL, inspect capabilities, mount a source, fit to data, dispose cleanly, handle errors, cancel a request.

Walkthrough: First map from endpoint to inspected MapLibre layer.

Project: Maui Data Explorer.

### Track 2: sources and protocols

Examples: FeatureServer, MapServer, ImageServer, GeometryServer discovery, OGC API Features, OGC API Tiles, OGC API Maps, OGC API Records, WFS, WMS, WMTS, WCS, OData, STAC, MVT/TileJSON, PMTiles, gRPC, MCP.

Walkthrough: One Maui parcels source through GeoServices, OGC API Features, OData, and OGC API Tiles.

Project: Universal Service Explorer.

### Track 3: query and analyze

Examples: SQL filter, bbox filter, geometry filter, paging, order, field projection, count, extent, statistics, grouped statistics, explain plan, worker execution, export GeoJSON, export CSV, export GeoParquet, export GeoArrow.

Walkthrough: Find and summarize flood-exposed parcels.

Project: Coastal Risk Analytics Workbench.

### Track 4: map, style, and interact

Examples: point/line/polygon layers, categorical style, class breaks, continuous color, size, labels, popup, side-panel details, hover, click, rectangle select, highlight, cluster, heatmap, legend, layer list, basemap switcher, swipe, camera bounds, synchronized views.

Walkthrough: Build an interactive zoning and parcel map.

Project: Maui Planning and Permitting Workbench.

### Track 5: edit and sync

Examples: create, update, delete, sketch, snapping, form validation, attachments, partial failure, optimistic state, conflict detection, edit queue, replay, offline region, quota, credential screening, collaboration session, replica checkpoint.

Walkthrough: Take parcel inspections offline and synchronize edits safely.

Project: Field Operations.

### Track 6: imagery, raster, and multidimensional data

Examples: STAC landing, STAC search, collection browse, asset roles, open a COG, range requests, MapLibre COG source, ImageServer export, ImageServer identify, WMS image, WMTS tiles, WCS metadata, Coverage subset, Terrain-RGB, elevation point, elevation profile.

Preview Examples after product readiness: Zarr metadata, variable selection, time slice, elevation slice, NetCDF registration, NetCDF subset.

Walkthrough: Discover a STAC scene, inspect its COG, and render it over Maui.

Project: Cloud-Native Imagery Lab.

### Track 7: vector tiles and portable delivery

Examples: TileJSON, MVT source, OGC API Tiles, tile cache seed, tile invalidation, PMTiles archive, PMTiles publish, range proxy, local PMTiles, style a published tileset.

Walkthrough: Publish a feature layer as MVT and a durable PMTiles archive.

Project: Maui Offline Basemap Builder.

### Track 8: columnar and warehouse analytics

Examples: request GeoParquet, request GeoArrow, decode Arrow, inspect geometry metadata, transfer to a worker, aggregate, reproject, cache in IndexedDB, render with Deck.gl, render with Kepler, accessible table, linked filters, viewport statistics.

Future Examples: H3 and Quadbin only when the server/source contract is real and not merely opaque fixture metadata.

Walkthrough: Query 50,000 buildings as Arrow, aggregate in a worker, and render with Deck.gl.

Project: Maui Building Analytics.

### Track 9: realtime and time

Examples: SSE subscription, WebSocket subscription, OData delta, resume cursor, checkpoint store, dedupe, reconnect, selection reconciliation, temporal filter, time slider, playback controls.

Walkthrough: Build a resumable incident feed with temporal playback.

Project: Incident Command Dashboard.

### Track 10: search, routing, and geometry

Examples: forward geocode, reverse geocode, suggestions, custom search source, route, route instructions, polyline decode, buffer, intersect, union, area, length, project, geometry service execution, process job polling.

Future Examples: service areas, optimization, map matching, and network analysis after the SDK and demo services support them.

Walkthrough: Search for a place, route to it, and analyze nearby hazards.

Project: Evacuation Planning.

### Track 11: authentication and deployment

Examples: API key, OAuth/PKCE, bearer, client credentials in a backend, token refresh, request redaction, row-level security behavior, tenant headers, compatibility check, diagnostics bundle.

Walkthrough: Secure a browser application without shipping a server secret.

Project: Authenticated Operations Portal.

### Track 12: AI, automation, and migration

Examples: inspect map context, list sources, list capabilities, provider tool schemas, MCP tool definitions, OpenAI tool definitions, dry-run plan, approval envelope, execute step, execution receipt, explain capability gap, parse web map, convert renderer, convert popup, convert labels.

Walkthrough: Add a plan-first map assistant with explicit approval.

Walkthrough: Migrate an ArcGIS web map and inspect every conversion warning.

Projects: Agent-Assisted Map Operations and ArcGIS Migration Workbench.

### Track 13: frameworks and components

Examples: vanilla TypeScript, web components, React provider, React source layer, React popup, external MapLibre map, accessible feature table, feature editor.

Future starters: Vue, Svelte, and Angular after CI ownership is assigned.

Walkthrough: Build the same inspected map with vanilla TypeScript and React.

Project: Component-Based Developer Portal.

## First implementation wave

The first wave should demonstrate current, production-capable server and client surfaces. It should not wait for every SDK gap to close.

### 24 Examples

1. Display a MapLibre map.
2. Connect to a FeatureServer layer.
3. Inspect a source and its capabilities.
4. Query with a SQL filter.
5. Query with a bounding box.
6. Page through features.
7. Cancel a query.
8. Mount a source to MapLibre.
9. Style categories.
10. Show a popup and accessible detail panel.
11. Add a legend.
12. Add a layer list.
13. Query OGC API Features.
14. Render OGC API Tiles.
15. Render WMS.
16. Render WMTS.
17. Search STAC.
18. Open and render a COG.
19. Load PMTiles.
20. Request GeoParquet.
21. Decode GeoArrow in a worker.
22. Subscribe with SSE and resume.
23. Create an offline region.
24. Dry-run and approve an agent plan.

### 6 Walkthroughs

1. First Map.
2. Query and style Maui parcels.
3. STAC to COG imagery.
4. MVT to PMTiles delivery.
5. Offline editing and replay.
6. Plan-first AI map control.

### 6 Projects

1. Maui Data Explorer.
2. Planning and Permitting Workbench.
3. Cloud-Native Imagery Lab.
4. Building Analytics Workbench.
5. Incident Command Dashboard.
6. ArcGIS Migration Workbench.

## Presentation requirements

### Example page

Use a split layout with the running output and a syntax-highlighted code editor. Keep a file tab only when a second file is essential. Provide Copy, Reset, Open full screen, Download, and Open in StackBlitz actions.

The inline code must be canonical source from the repository artifact. Do not scrape GitHub at runtime and do not display a generated bundle as source.

### Walkthrough page

Show the current step, the code diff, the running checkpoint, expected output, and a verification statement. Preserve progress in the URL so steps are linkable. The final step links to a complete Project or downloadable starter.

### Project page

Lead with the running application and its user outcome. Show architecture, prerequisites, data provenance, and evidence before the full source tree. GitHub is an additional action, not the only way to inspect code.

### Catalog filters

Primary content filters: Examples, Walkthroughs, Projects.

Capability filters: Connect, Map, Query, Analyze, Edit, Offline, Realtime, Raster, Tiles, Columnar, AI, Auth, Migrate.

Technology filters: Vanilla, Web Components, React, MapLibre, Deck.gl, Kepler, Cesium, Node, Python, REST.

Maturity filters: Supported, Preview, Experimental.

Runtime filters: Works now, Requires configuration, Requires backend, Fixture only.

## Live data strategy

Use the Maui seed as a connected curriculum instead of selecting a different external dataset for every page.

Build inputs must come from a pinned snapshot of `demo-services.v1.json`. The deployment lane must also fetch the current live manifest and prove that the pinned entries still exist before publishing.

Every live Example needs a deterministic fallback or a clear `Requires backend` classification. Never silently replace a dead endpoint with an empty map.

Add these service families to the demo manifest in priority order:

1. Writable feature layer for edit and attachment samples.
2. Raster coverage layer exposed through ImageServer, WCS, and OGC API Coverages.
3. Realtime incident feed.
4. GeoParquet/GeoArrow-enabled feature query target.
5. Quota-limited geocoding target.
6. Quota-limited routing target.
7. Zarr datacube only after its public contract is stable.

## Verification and deployment policy

Publication must fail closed.

Each published route must prove:

- The HTML route returns 200.
- All local assets resolve under the deployed subpath.
- No unexpected off-origin request occurs.
- No request fails.
- No console or page error occurs.
- The sample-specific semantic completion signal is true.
- The expected renderer surface exists, such as a MapLibre canvas.
- The expected result is non-empty, such as a feature count or raster tile.
- Desktop and mobile viewport checks pass.
- The exact artifact tested is the artifact uploaded.

The gallery landing page must be generated only from samples that passed the exact artifact gate. A failed new deployment must leave the prior deployment intact.

Live canaries belong in `honua-demo-environment`. Browser behavior and source/artifact assertions belong in `honua-samples`.

## Delivery sequence

### Phase 0: capability truth and naming

- Decide and execute the `honua-demo` repository rename.
- Add the `demo.honua.io` landing response.
- Join server, SDK, demo manifest, and sample evidence into one capability projection.
- Add `contentType` and maturity fields to the sample catalog.

### Phase 1: information architecture and first wave

- Add Examples, Walkthroughs, and Projects navigation.
- Convert First Map into a small Example, a Walkthrough, and the existing qualified Project.
- Publish the first 24 Examples, 6 Walkthroughs, and 6 Projects listed above.
- Make inline repository source the default code view.

### Phase 2: differentiated cloud-native curriculum

- Publish STAC-to-COG, MVT-to-PMTiles, and GeoParquet/GeoArrow end-to-end tracks.
- Seed and publish a live coverage target.
- Add the OGC API Coverages/WCS SDK client.
- Promote raster and columnar Projects.

### Phase 3: workflow completion

- Complete editing/offline sync, realtime, auth, geocoding, routing, and process execution.
- Add Vue, Svelte, and Angular starters only after CI ownership exists.
- Promote Zarr and multidimensional samples only after server and SDK maturity gates pass.

### Phase 4: selective advanced capability

- Add terrain and 3D buildings first.
- Use customer demand to choose any further scene, point-cloud, BIM, utility-network, or knowledge-graph work.

## Success measures

- A developer can get a working map in under five minutes without reading a project-sized source file.
- Every supported SDK entrypoint has at least one focused Example.
- Every production server protocol has a client Example or an explicit SDK-gap card.
- Every Project links to the Examples and Walkthroughs that compose it.
- Every public sample has a current exact-artifact browser receipt.
- No public sample hard-codes a demo service that is absent from the demo manifest.
- Search results distinguish functionality gaps from documentation gaps.
- Cloud-native formats are prominent, not buried behind competitor-shaped categories.
