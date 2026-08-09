# Honua developer examples and SDK gap plan

Status: working product plan

Research date: 2026-08-08

## Decision summary

1. Keep `honua-samples` as the public catalog and deployment owner for three content kinds: Examples, Walkthroughs, and Projects.
2. Keep the already-final `honua-demo-infra` repository name. It owns Terraform, seed provenance, the public service manifest, canaries, quotas, deployment operations, and runbooks. It does not own developer application source.
3. Keep `samples.honua.io` as the canonical developer gallery. Make `sample.honua.io` redirect permanently to it. Treat `honua.io/samples` as a product-site projection or redirect, never a second catalog or source tree.
4. Keep `demo.honua.io` as the public API environment. Its root response must identify the environment and link to the versioned service manifest, live/ready health, API documentation, and `samples.honua.io` without changing existing API routes.
5. Use `contentKind` for public presentation shape. Add orthogonal `portfolioTrack`, `supportTier`, and `sourceOfTruth` fields so a Project can remain canonically sourced in `honua-sdk-js` without being mislabeled or duplicated in `honua-samples`.
6. Stop publishing qualification apps as beginner examples. A large SDK application may remain a tested Project, but it must link to focused Examples and an incremental Walkthrough that teach its supported parts.
7. Publish only dependency-gated vertical slices. Fixture evidence, live evidence when claimed, exact SDK/server bytes, semantic assertions, and rollback readiness are release inputs, not follow-up polish.
8. Prioritize SDK gaps that unlock already-shipping Honua Server capability and ordinary day-two mapping before copying the long tail of competitor renderer effects or proprietary domain workflows.

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

`honua-demo-infra` publishes `https://demo.honua.io/demo-services.v1.json`. Its current seed tells a coherent Maui story across parcels, zoning, roads, flood hazard, sea-level rise, place names, buildings, hillshade, terrain, imagery, PMTiles, and STAC.

That manifest must become the only source for public live sample endpoints. Samples must not hand-code service URLs that drift independently from the environment. The consumer and byte-drift contract is tracked in [`honua-samples#20`](https://github.com/honua-io/honua-samples/issues/20).

The demo environment does not currently advertise public geocoding, routing, realtime, writable editing, WCS/Coverages, Zarr, NetCDF, or GeoParquet/GeoArrow services. Those omissions limit which SDK walkthroughs can have a real anonymous live lane.

### Evidence status at the research date

Implemented evidence and planned gates must remain visibly separate:

- The generated demo manifest, its stable URL, manifest-drift check, and a scheduled live service-family canary exist in `honua-demo-infra`. The manifest does not yet prove every server protocol or every planned sample target; that expansion remains open in [`honua-demo-infra#16`](https://github.com/honua-io/honua-demo-infra/issues/16).
- The `honua-samples` branch in draft [`PR #28`](https://github.com/honua-io/honua-samples/pull/28) adds the information architecture and semantic gallery crawling. The PR description currently reports 17 of 18 admitted routes and 10 of 11 runnable semantics passing with its stale local SDK artifact. It must not be described as deployed or fully passing before its recorded SDK bundle blocker is resolved.
- The current gallery workflow has Chromium exact-artifact smoke and a post-deploy live check. Cross-browser, mobile-viewport, accessibility, CSP, evidence-freshness, atomic promotion, and automatic rollback are planned gates below, not current implementation claims.
- Realtime and columnar golden journeys retain explicit dependencies in [`honua-samples#22`](https://github.com/honua-io/honua-samples/issues/22) and [`honua-samples#23`](https://github.com/honua-io/honua-samples/issues/23). NetCDF/Zarr demo work remains open in [`honua-demo-infra#15`](https://github.com/honua-io/honua-demo-infra/issues/15).

## Repository naming and ownership

### Final names and domain contract

| Name | Decision | Contract |
|---|---|---|
| `honua-samples` | Final | Owns the public learning catalog, gallery, publication policy, and sample evidence projection. |
| `honua-demo-infra` | Final | Owns the live demo environment infrastructure and operations. Do not schedule another rename. |
| `demo.honua.io` | Final API environment | Preserve existing API paths. Add an accurate root landing response generated from the same deployment and manifest truth. |
| `samples.honua.io` | Canonical gallery | All public Example, Walkthrough, and Project routes resolve here. |
| `sample.honua.io` | Permanent redirect | Redirect path-for-path to `samples.honua.io`; do not host an independent build. |
| `honua.io/samples` | Product-site projection | Link or redirect to canonical gallery routes. It may showcase selected content but must not copy runnable source or invent support state. |

### Ownership contract

| Repository | Owns | Does not own |
|---|---|---|
| `honua-samples` | Public information architecture, catalog metadata, gallery rendering, inline source projection, route compatibility, fixture/live receipt admission, and gallery deployment gates; canonical source only for artifacts whose `sourceOfTruth` points here | Live cloud infrastructure, SDK implementation, or silent copies of SDK-owned Project source |
| `honua-sdk-js` | SDK code, API reference, starter templates, contract tests, qualification fixtures/apps, and canonical source for SDK-owned Projects until an explicit migration changes `sourceOfTruth` | The public information architecture or production gallery deployment |
| `honua-demo-infra` | Terraform, seed provenance, `demo-services.v1.json`, endpoint canaries, quotas, deployment operations, and environment runbooks | Public application source or gallery presentation |
| `honua-server` | Protocol and operation implementation, OpenAPI, seed contracts, conformance, and server guides | Browser sample presentation |
| `honua-site` | Product documentation, conceptual guides, selected showcases, and links or redirects into the canonical sample catalog | A second catalog, support matrix, or copy of runnable sample code |

Existing references to the old `honua-demo` slug should be corrected through a bounded link and OIDC/workflow audit. GitHub redirects are compatibility aids, not the canonical name. Do not rename the live DNS names or move application code into the environment repository.

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
| Ordinary map mechanics | Source/layer add-update-remove, feature state, expression debugging, style JSON/imports, dynamic images/glyphs, projections, camera transitions, geolocation, navigation controls, and print/export are not a coherent curriculum. | Focused MapLibre recipes or explicit capability-gap cards; do not manufacture SDK wrappers where renderer APIs are the honest abstraction. |
| OGC API Maps, Records, Styles, and Processes | Protocol names appear in inventories, but developers need task-shaped requests and unsupported-state behavior. | Discovery plus one concrete render, search, style, execute/poll/cancel, and error-handling Example for each supported task. |
| Offline, collaboration, saved workspaces | Strong primitives have no coherent public journey. | Offline map Walkthrough and Field Operations Project. |
| AI safety | Differentiated functionality is bundled into labs. | Inspect, tool schema, plan, approve, execute, receipt, and provider-adapter Examples. |
| Migration | Workbench exists, but the small migration tasks are not teachable independently. | Web map conversion, renderer conversion, endpoint swap, and parity-check Examples. |
| Start, debug, test, deploy, performance, and reference | API qualification does not teach installation, version selection, environment setup, diagnosis, automated verification, hosting, or production budgets. | Dedicated foundation tracks with copyable diagnostics, tests, deployment patterns, and exact API/protocol links. |

## Public information architecture

### Examples

Purpose: answer one question with the smallest working code.

Contract:

- One concept.
- Prefer 15-40 relevant lines.
- Inline code is the primary source view.
- Live result beside the code.
- Copy and download actions. Offer StackBlitz only when the runtime, licenses, network policy, and authentication model can actually run there; do not offer it for Python, secret-bearing backends, or local-integration-only content.
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
- GitHub, download, and local-run actions resolved from the declared canonical `sourceOfTruth` repository, path, and immutable ref.
- Explicit backend, authentication, license, and data prerequisites.
- Desktop and mobile screenshots.
- Fixture and live evidence receipts.
- No claim that the project is a minimal quickstart.

URL shape: `/projects/{slug}/`

### Reference playgrounds

API reference pages may embed a compact playground, but the public catalog should point at the canonical Example. Do not fork the source into a second documentation tree.

### Orthogonal catalog classification

The public content shape and the portfolio lifecycle answer different questions and must not be overloaded into one field:

| Field | Allowed values | Meaning |
|---|---|---|
| `contentKind` | `example`, `walkthrough`, `project` | How the developer learns from the artifact. |
| `portfolioTrack` | `golden`, `recipe`, `lab`, `internal-fixture` | How the artifact participates in the maintained portfolio. Recipes normally render as Examples; golden journeys normally render as Walkthroughs or Projects. Internal fixtures are executable but not public routes. |
| `supportTier` | `supported`, `preview`, `experimental`, `planned` | Product maturity justified by the generated capability matrix, never inferred from visual polish. |
| `sourceOfTruth` | repository, path, immutable ref | Where canonical inspectable source lives. The gallery may project it but must not silently fork it. |

The existing `wms-getmap-check` is a single executable verification script and should be reclassified as an Example/recipe unless it is expanded to the Walkthrough contract. [`PR #17`](https://github.com/honua-io/honua-samples/pull/17) modernizes its runner but does not by itself make it a multi-step Walkthrough.

### Mandatory per-sample evidence contract

Every public route must declare these fields before admission:

| Field | Required value |
|---|---|
| Identity and classification | Stable id, `contentKind`, `portfolioTrack`, `supportTier`, runtime classification, and canonical route. |
| Source | `sourceOfTruth.repository`, path, immutable commit/tag, and the source artifact digest rendered inline. |
| SDK | Package/version plus packed tarball or bundle SHA-256. Repository-source-only evidence is insufficient for a supported public claim. |
| Server | Image reference pinned by digest and advertised server capability/protocol version. Moving `trunk` tags are not publication evidence. |
| Fixture | Fixture id, schema version, byte digest, seed procedure, and expected semantic result. |
| Demo manifest | Manifest schema/version, byte digest, and exact `serviceKey`/protocol block used by each live lane. |
| Semantic assertion | Declarative assertion id, timeout, expected state, minimum/non-empty result, renderer surface, and allowed network origins. |
| Receipts | Exact artifact/release id, fixture receipt, live receipt when claimed, produced-at time, expiry, and TTL policy. |
| Ownership and dependencies | Maintainer/team, canonical repository, blocker issue/PR links, reset/quota owner for mutable samples, and retirement/replacement route. |

The schema and generated catalog must validate this contract. A hard-coded assertion registry may implement an assertion adapter, but it is not the source of sample admission truth.

## Comprehensive curriculum

### Track 1: start and connect

Examples: choose a supported runtime and pinned SDK version, install and import the package, configure vanilla TypeScript, display a map, create a client, connect from a URL, inspect capabilities, understand connection/source/plan/receipt concepts, mount a source, fit to data, dispose cleanly, handle errors, and cancel a request.

Walkthrough: First map from endpoint to inspected MapLibre layer.

Project: Maui Data Explorer.

### Track 2: sources and protocols

Examples: FeatureServer, MapServer, ImageServer, GeometryServer discovery, OGC API Features query, OGC API Tiles render, OGC API Maps render, OGC API Records search, OGC API Styles retrieve/apply, OGC API Processes execute/poll/cancel, WFS, WMS, WMTS, WCS, OData, STAC, MVT/TileJSON, PMTiles, gRPC-web or server-side gRPC as applicable, and MCP.

Walkthrough: One Maui parcels source through GeoServices, OGC API Features, OData, and OGC API Tiles.

Project: Universal Service Explorer.

### Track 3: query and analyze

Examples: SQL filter, bbox filter, geometry filter, paging, order, field projection, count, extent, statistics, grouped statistics, explain plan, worker execution, export GeoJSON, export CSV, export GeoParquet, export GeoArrow.

Walkthrough: Find and summarize flood-exposed parcels.

Project: Coastal Risk Analytics Workbench.

### Track 4: map, style, and interact

Examples: point/line/polygon layers, source/layer add-update-remove lifecycle, feature state, categorical style, class breaks, continuous color, expressions and expression debugging, size, labels, symbols/images/glyphs, style JSON/imports, popup, side-panel details, hover, click, rectangle select, highlight, cluster, heatmap, legend, layer list, basemap switcher, projections, geolocation and navigation controls, camera fit/fly/ease/bounds, synchronized views, custom MapLibre layers, and print/export of current map state.

Walkthrough: Build an interactive zoning and parcel map.

Project: Maui Planning and Permitting Workbench.

### Track 5: edit and sync

Examples: create, update, delete, sketch, snapping, form validation, attachments, partial failure, optimistic state, conflict detection, edit queue, replay, offline region, quota, credential screening, collaboration session, replica checkpoint.

Walkthrough: Take parcel inspections offline and synchronize edits safely.

Project: Field Operations.

### Track 6: imagery, raster, and multidimensional data

Examples: STAC landing, STAC search, collection browse, asset roles, open a COG, range requests, MapLibre COG source, ImageServer export, ImageServer identify, WMS image, WMTS tiles, WCS metadata, Coverage subset, Terrain-RGB, elevation point, elevation profile.

Zarr Preview Examples only after the server public contract, docs, demo seed, SDK slice client, fixture evidence, and live receipt agree: metadata, variable/axis selection, time slice, and elevation slice.

NetCDF, HDF5, and GRIB remain reference-only status and capability-gap pages while the server lacks production metadata extraction and subset readers. Registration alone is an admin operation, not a runnable client capability and not grounds for a public Example.

Walkthrough: Discover a STAC scene, inspect its COG, and render it over Maui.

Project: Cloud-Native Imagery Lab.

### Track 7: vector tiles and portable delivery

Examples: TileJSON, MVT source, OGC API Tiles, tile cache seed, tile invalidation, PMTiles archive, PMTiles publish, range proxy, local PMTiles, style a published tileset.

Walkthrough: Publish a feature layer as MVT and a durable PMTiles archive.

Project: Maui Offline Basemap Builder.

### Track 8: columnar and warehouse analytics

Examples: request GeoParquet, request GeoArrow, decode Arrow, inspect geometry metadata, transfer to a worker, aggregate, reproject, cache in IndexedDB, render with Deck.gl, render with Kepler, accessible table, linked filters, viewport statistics, formula, categories, histogram, range, and time-series models.

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

Examples: API key, OAuth/PKCE, bearer, client credentials in a backend, token refresh, request redaction, row-level security behavior, tenant headers, compatibility check, diagnostics bundle, CSP and worker/WASM hosting, base paths, CDN/cache headers, environment injection without secrets, source maps, and deployment health checks.

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

### Track 14: debug, test, performance, and reference

Examples: diagnose CORS and mixed content, distinguish authentication from unsupported capability and empty data, inspect request/plan/receipt diagnostics, fix CRS/axis-order and tile-coordinate mistakes, debug PMTiles range requests, debug worker/WASM loading, inspect IndexedDB quota/cache state, detect lifecycle leaks, mock a connector, run a deterministic fixture, write a semantic Playwright assertion, test the packed SDK, measure bundle size, profile first render and interaction latency, and produce a redacted diagnostics bundle.

Reference contract: every public content route links the exact SDK symbols, wire-protocol request/response reference, support/maturity matrix cell, error codes, compatibility range, and related release or migration note. Reference pages link back to the smallest canonical Example.

## Initial dependency-gated increment

The initial increment proves the evidence and teaching system with one beginner vertical slice. It does not claim portfolio completeness and it does not wait for unrelated SDK gaps.

### 8 Examples

1. Display a MapLibre map.
2. Install/create a Honua client and connect to the manifest-selected Maui FeatureServer layer.
3. Inspect the selected source and its capabilities.
4. Run one bounded SQL filter.
5. Run one bounding-box query.
6. Mount the accepted result and fit the camera.
7. Style one category field with a legend.
8. Show a popup and accessible detail panel.

### 1 Walkthrough

First Map: install, connect, inspect, explain, query, mount, interact, and dispose through named checkpoints. Its final checkpoint links to the Project below.

### 1 Project

Maui Data Explorer, labeled in catalog metadata as the First Map Project. This is the one production-shaped composition for the initial slice; it is not counted as a second unnamed First Map Project.

All ten routes require the mandatory evidence contract, exact packed-SDK and pinned-server fixture receipts, and fresh live receipts for their manifest-backed claims before admission. If a live target is unavailable, the route is `fixture-only` or remains unpublished; it is never silently labeled `works-now`.

SSE/realtime, offline editing, agent execution, GeoParquet/GeoArrow live flows, MVT-to-PMTiles publishing, and the six-project uplift are not part of the initial increment. They enter only through the gated vertical slices below.

## Presentation requirements

### Example page

Use a split layout with the running output and a syntax-highlighted code editor. Keep a file tab only when a second file is essential. Provide Copy, Reset, Open full screen, and Download actions. Add Open in StackBlitz only when the declared runtime can run there without hidden services or secrets.

The inline code must be canonical source from the repository artifact. Do not scrape GitHub at runtime and do not display a generated bundle as source.

### Walkthrough page

Show the current step, the code diff, the running checkpoint, expected output, and a verification statement. Preserve progress in the URL so steps are linkable. The final step links to a complete Project or downloadable starter.

### Project page

Lead with the running application and its user outcome. Show architecture, prerequisites, data provenance, and evidence before the full source tree. Resolve GitHub and download actions from `sourceOfTruth`; GitHub is an additional action, not the only way to inspect code.

### Catalog filters

Primary content filters: Examples, Walkthroughs, Projects.

Portfolio filters: Golden, Recipe, Lab. Internal fixtures are excluded from public navigation.

Capability filters: Connect, Map, Query, Analyze, Edit, Offline, Realtime, Raster, Tiles, Columnar, AI, Auth, Migrate.

Technology filters: Vanilla, Web Components, React, MapLibre, Deck.gl, Kepler, Cesium, Node, Python, REST.

Maturity filters: Supported, Preview, Experimental.

Runtime filters: Works now, Requires configuration, Requires backend, Fixture only.

Source filters: `honua-samples`, `honua-sdk-js`, and any future explicitly admitted canonical repository.

## Live data strategy

Use the Maui seed as a connected curriculum instead of selecting a different external dataset for every page.

Build inputs must come from a byte-digested snapshot of `demo-services.v1.json`. The deployment lane must fetch the current live manifest, record its digest, and prove that every declared `serviceKey` and protocol block still exists and passes its semantic canary before promotion.

Every live Example needs a deterministic fallback or a clear `Requires backend` classification. Never silently replace a dead endpoint with an empty map.

Add these service families to the demo manifest in dependency order. Their presence alone is insufficient; the server, SDK, reset/quota policy, manifest entry, canary, and sample receipt must agree:

1. Raster coverage layer exposed through ImageServer, WCS, and OGC API Coverages.
2. GeoParquet/GeoArrow-enabled feature query target.
3. Writable sandbox feature layer for edit and attachment samples, with idempotent reset and quotas.
4. Realtime incident feed with deterministic replay and resumable live canary.
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
- Chromium, Firefox, and WebKit release lanes pass for the declared browser matrix.
- Keyboard, automated accessibility, CSP, cleanup, and declared bundle/performance budgets pass.
- The exact artifact tested is the artifact uploaded.
- The fixture and live receipts are unexpired and refer to the same source, SDK bytes, server image, fixture, demo manifest, and release artifact being promoted.

The gallery landing page must be generated only from samples that passed the exact artifact gate. Missing or stale run evidence is fatal in production; best-effort evidence is allowed only for local development. A failed new deployment must leave or restore the prior deployment intact.

Live service canaries belong in `honua-demo-infra`. Browser behavior, inline-source integrity, content contracts, and release-artifact assertions belong in `honua-samples`.

### Immutable release and promotion flow

1. Build once from immutable source, packed SDK bytes, pinned server image digest, fixture digest, and demo manifest snapshot. Assign a release id and artifact SHA-256.
2. Deploy that exact artifact to a non-public preview/staging origin. Run all fixture semantics, route/source assertions, browser/viewports, accessibility, CSP, lifecycle, and performance gates there.
3. Fetch the live demo manifest and require fresh semantic canaries for every live claim. The canary receipt must bind the live manifest digest and service keys to the same release candidate.
4. Promote the already-tested immutable artifact through an atomic pointer or equivalent host-supported promotion. Do not rebuild during promotion.
5. Run post-promotion synthetics against the canonical domains. On failure, automatically restore the recorded last-known-good release and rerun its root and representative semantic checks.
6. Retain release manifests, receipts, screenshots on failure, and the last known-good artifact. Record promotion and rollback in an auditable release history.

### Observability and release SLOs

| Measure | Release requirement |
|---|---|
| Admitted route coverage | 100% of generated public routes pass exact-artifact fixture semantics before promotion. |
| Supported live-claim coverage | 100% of matrix rows marked live-capable have an unexpired semantic canary bound to the promoted manifest digest and service key. |
| Evidence freshness | Live receipts are at most 6 hours old at promotion; fixture receipts are produced from the release candidate itself. |
| Browser and viewport coverage | 100% of declared Chromium, Firefox, and WebKit desktop lanes plus the declared mobile viewport lanes pass. |
| Error budget | Zero unexpected request failures, page/console errors, unsupported-state masquerades, or unapproved off-origin requests on admitted routes. |
| Promotion detection | Canonical-domain post-promotion synthetics begin within 5 minutes of promotion and complete within 10 minutes. |
| Rollback | Restore the last known-good artifact within 10 minutes of a failed post-promotion gate and prove its root plus representative semantics. |
| Evidence retention | Keep release manifest and machine-readable receipts for at least 90 days; keep failure screenshots/logs for at least 30 days. |
| Alerting | Canary, drift, promotion, or rollback failures notify the named owner through the configured operational channel and create or update a durable incident record. |
| First-map onboarding | In a quarterly clean-environment usability run, at least 90% of participants complete the supported First Map path in 5 minutes without opening Project-sized source. |

The current six-hour demo canary and Chromium gallery smoke are inputs to this design, not proof that all SLOs above are already met. Terraform drift detection must be enabled, fail or page according to policy rather than neutral-no-op indefinitely, and report known out-of-band resources until reconciled.

## Generated capability-task denominator

One generated matrix joins the server capability registry, SDK catalog, demo manifest, sample catalog, and current receipts. Its canonical row key is:

`capability + developer task + protocol + runtime + support tier`

The matrix is the denominator for completeness. It avoids the unbounded and low-value rule that every SDK method needs its own Example.

| Metric | Calculation | Required target |
|---|---|---|
| Supported executable coverage | Supported rows with a passing canonical Example or golden journey / all supported rows | 100% before a supported release claim |
| Supported live compatibility | Live-capable supported rows with an unexpired live receipt / all live-capable supported rows | 100% at gallery promotion |
| Reference coverage | Supported rows linked to exact SDK and protocol reference / all supported rows | 100% |
| Project composition coverage | Public Projects linking all composing Examples and Walkthroughs / all public Projects | 100% |
| Explicit gap coverage | Partial, preview, experimental, and planned rows with an evidence-backed status/gap card / all non-supported rows | 100% |

Rows change support tier only when the joined evidence changes. Search and filters expose the row state, owner, last receipt, and blocker so documentation gaps cannot be mistaken for product gaps.

## Delivery sequence

### Stage 0: canonical ownership and current-state correction

- Record `honua-demo-infra` as final and correct stale `honua-demo` links, workflow subjects, and owner metadata without another rename.
- Lock the canonical domain/redirect contract and assign DNS, gallery, demo landing, and incident owners.
- Add `portfolioTrack`, `supportTier`, `sourceOfTruth`, and the mandatory evidence fields alongside the existing `contentKind`.
- Reclassify `wms-getmap-check` as an Example/recipe unless it is expanded to a real multi-step Walkthrough.
- Reconcile the plan with the canonical portfolio and evidence epic in [`honua-samples#21`](https://github.com/honua-io/honua-samples/issues/21).

Exit: schema vocabulary, repository ownership, canonical routes, source locations, and blocker links agree in docs and generated catalog.

### Stage 1: evidence, discovery, and release substrate

- Complete the byte-bound demo-manifest consumer and drift contract in [`honua-samples#20`](https://github.com/honua-io/honua-samples/issues/20).
- Generate the capability-task matrix and bind every route to immutable SDK/server/fixture/manifest inputs.
- Make evidence mandatory, add preview/staging verification, implement immutable promotion and last-known-good rollback, and wire alerting/retention dashboards.
- Add an accurate `demo.honua.io` root response and path-preserving domain redirects, then verify them as release routes.
- Resolve draft [`PR #28`](https://github.com/honua-io/honua-samples/pull/28) only after its recorded [`honua-sdk-js#1111`](https://github.com/honua-io/honua-sdk-js/pull/1111) bundle dependency and all admitted semantics pass against the byte-bound handoff.

Exit: the release substrate meets the SLO table with a deliberately failed staging candidate and successful automatic preservation/restoration of the prior public release.

### Stage 2: beginner vertical slice

- Publish the 8 Examples, First Map Walkthrough, and Maui Data Explorer Project in the initial increment.
- Make canonical inline source, troubleshooting, API/reference links, fixture receipts, and manifest-backed live receipts visible on every route.
- Measure the first-map onboarding SLO and treat excess ceremony as an SDK ergonomics defect.

Exit: all ten routes meet the evidence contract, the Project links its composing content, and the exact promoted artifact passes the release SLOs.

### Stage 3: differentiated read-only vertical slices

- Ship STAC search to COG range/render after the manifest asset path, SDK session, fixture, and live canary agree.
- Ship PMTiles consumption and styling before mutable publish/archive workflows.
- Ship GeoParquet/GeoArrow query, worker, aggregation, and renderer slices after the demo query target and bounded public-object evidence exist.
- Seed the coverage target, add the OGC API Coverages/WCS client, then publish metadata/subset/render slices.
- Promote one Project only after its Examples and Walkthrough pass; do not batch-promote six Projects.

Exit per slice: supported matrix rows have 100% executable/reference/live coverage and no hidden fixture-only production claim.

### Stage 4: ordinary day-two mapping and developer operations

- Publish source/layer lifecycle, feature-state, expressions, projections, camera, geolocation, controls, print/export, OGC Maps/Records/Styles/Processes, analytics widgets, and common geometry tasks.
- Publish the Start, Debug, Test, Deploy, Performance, and Reference foundations.
- Enforce accessibility, keyboard, CSP, cleanup, bundle, and performance gates across every supported route rather than treating them as optional examples.

Exit: the generated matrix covers the ordinary competitor-baseline tasks with executable content or explicit evidence-backed gap cards.

### Stage 5: mutable and partial workflows

- Complete editing/offline sync, realtime, auth, geocoding, routing, process execution, PMTiles publishing, and AI approval/execution only after the SDK contracts and demo services qualify.
- Require isolated run ids, quotas, idempotent reset, authorization boundaries, and reset canaries for every mutable live sample.
- Keep experimental AI, offline, realtime, and collaboration paths out of supported golden status until their canonical matrix claims and live receipts agree.

Exit per workflow: deterministic chaos/error fixtures, safe live sandbox/reset evidence, and an owned operational runbook all pass.

### Stage 6: selective advanced capability

- Add terrain and 3D buildings first.
- Promote Zarr only after its server contract, docs, demo seed, SDK client, fixtures, and live evidence agree.
- Keep NetCDF, HDF5, and GRIB reference-only until production metadata and subset readers ship; then expose them through the coverage-oriented client rather than format-specific UI.
- Add Vue, Svelte, and Angular starters only after generated templates and CI ownership exist.
- Use customer demand to choose any further scene, point-cloud, BIM, utility-network, or knowledge-graph work.

## Success measures

- The generated capability-task matrix reports 100% supported executable coverage, 100% supported live compatibility for live-capable rows, 100% reference coverage, and 100% explicit non-supported gap coverage.
- The quarterly first-map onboarding SLO is met: at least 90% complete in 5 minutes from a clean supported environment without reading Project-sized source.
- Every public route has an unexpired exact-artifact receipt bound to immutable source, packed SDK bytes, server image digest, fixture digest, demo manifest digest/service key when live, and its semantic assertion.
- Every public Project declares canonical source and links all composing Examples and Walkthroughs; no source is silently duplicated between `honua-samples` and `honua-sdk-js`.
- `samples.honua.io` is canonical, `sample.honua.io` redirects path-for-path, `honua.io/samples` does not fork the catalog, and the `demo.honua.io` root advertises the exact live manifest and health/documentation links.
- Promotion, detection, evidence retention, alerting, and automatic rollback meet the release SLO table, including a periodic rollback drill.
- No public sample hard-codes a demo endpoint absent from its pinned manifest, labels fixture output as live, or promotes a partial/experimental capability as supported.
- Search results expose capability-task state, content kind, portfolio track, support tier, runtime, canonical source, evidence freshness, owner, and blocker so product gaps and documentation gaps remain distinct.
- COG, STAC, PMTiles, GeoParquet/GeoArrow, and Coverages/WCS have prominent gated vertical slices. Zarr appears only at its evidenced maturity, and NetCDF/HDF5/GRIB remain reference-only until real readers qualify.
