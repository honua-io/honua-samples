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
9. Make developer `job` the primary information-architecture key. Use one canonical cross-SDK job page for a shared GIS outcome; protocol alternatives and JavaScript, Python, and .NET mappings live inside that page over one server contract, fixture, expected result, and semantic assertion. They do not create duplicate gallery cards.

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
| Job and server contract | Stable job id, server capability key, protocol family/version and alternatives, HTTP method, endpoint template, manifest service key or fixture URL, authentication, raw request/response examples, server documentation/manifest links, maturity, and server evidence reference. |
| Console configuration | When the job has a meaningful Console workflow: console route/version, required role, annotated screenshot evidence, equivalent executable JSON/API/CLI configuration, sanitized data reference, source/server/console versions, service key, capture time/TTL, visual receipt, and panel owner. |
| AI capability context | When AI is relevant: exact supported AI surface/tool, permitted tasks, manifest/schema/service context, provider/model/config/data boundary, safety policy, approval envelope, manual fallback, provenance, and deterministic receipt. |
| Reference matrix | Exact raw HTTP operation/protocol docs, CLI command and `--help`, JS symbol, Python symbol, and .NET method with package/assembly, minimum version, support tier, owner, and auth/cancel/error semantics. Missing cells are explicit capability gaps. |
| Source | `sourceOfTruth.repository`, path, immutable commit/tag, and the source artifact digest rendered inline. |
| SDK | Package/version plus packed tarball or bundle SHA-256. Repository-source-only evidence is insufficient for a supported public claim. |
| Server | Image reference pinned by digest and advertised server capability/protocol version. Moving `trunk` tags are not publication evidence. |
| Fixture | Fixture id, schema version, byte digest, seed procedure, and expected semantic result. |
| Demo manifest | Manifest schema/version, byte digest, and exact `serviceKey`/protocol block used by each live lane. |
| Semantic assertion | Declarative assertion id, timeout, expected state, minimum/non-empty result, renderer surface, and allowed network origins. |
| Receipts | Exact artifact/release id, fixture receipt, live receipt when claimed, produced-at time, expiry, and TTL policy. |
| Ownership and dependencies | Maintainer/team, canonical repository, blocker issue/PR links, reset/quota owner for mutable samples, and retirement/replacement route. |
| Cross-SDK snippets | Language, pinned SDK package/version and artifact digest, setup/auth/cancellation/error idioms, snippet `sourceOfTruth`, snippet owner, compile/run command, support state, and normalized semantic receipt schema. |

The schema and generated catalog must validate this contract. A hard-coded assertion registry may implement an assertion adapter, but it is not the source of sample admission truth.

### Unified cross-SDK job pages

A developer job that has the same observable GIS outcome across protocols and SDKs gets one canonical gallery route and card, for example `/examples/query-features/`. The page may expose protocol alternatives and JavaScript, Python, and .NET mappings, but the gallery does not create per-protocol or per-language duplicates.

`job` is the primary catalog and route identity. Capability, protocol, language, framework, and source repository are filters and implementation dimensions of that job. A protocol-specific page is justified only when the protocol behavior itself is the learning objective rather than an alternative way to complete the same job.

Every job page uses this order:

1. Outcome, bounded inputs, prerequisites, and normalized expected result.
2. Server-contract panel, before any language tab.
3. `Configure in Console` panel when the job has a meaningful implemented Console workflow.
4. `AI capability context` panel when an evidenced AI surface can assist the job.
5. Executable request/response inspector for the selected protocol alternative.
6. JavaScript, Python, and .NET SDK mapping tabs with explicit support states.
7. Required Reference matrix.
8. Normalized semantic receipt and equivalence comparison.
9. Evidence, maturity, owner/blocker, and related jobs.

The server-contract panel is mandatory and contains:

- Canonical server capability key and developer job id.
- Selected protocol family and version plus every supported protocol alternative for the job.
- Exact HTTP method, endpoint template, query/body schema, content negotiation, pagination/bounds, and response media type.
- Concrete `demo-services.v1.json` service key and resolved live URL, or the pinned fixture id/digest and fixture URL. URLs are generated from the manifest/fixture contract, never hand-coded in the page.
- Authentication and authorization requirements, including anonymous, API key, bearer/OAuth, admin, tenant, and backend-only constraints.
- A redacted raw request and bounded raw response tied to the current run, with the normalized expected result shown separately.
- Direct server OpenAPI/protocol documentation, demo manifest, conformance/evidence, maturity, and last verified server image/receipt links.

The job page owns one language-neutral contract:

- One job id, title, learning objective, server capability key, service key, protocol alternatives, fixture id/digest, bounded input, normalized expected result, semantic assertion id, and evidence TTL.
- One canonical live service selected through the pinned demo manifest when the task makes a live claim.
- One normalized receipt schema covering accepted source, normalized request intent, result count or raster/value summary, spatial reference, warnings/degradation, cancellation outcome when exercised, and assertion result.
- One related-content graph, maturity state, and gallery card regardless of the number of language implementations.

Each language tab maps the selected server contract through its language-specific contract:

- Pinned SDK package/version and artifact digest, supported runtime/toolchain, install/import instructions, and a directly runnable snippet or smallest runnable file.
- Idiomatic setup, authentication, cancellation, disposal, typed error handling, and result iteration. Task equivalence means the same normalized semantic outcome; it does not require identical method names, control flow, exception types, or syntax.
- An explicit `supported`, `partial`, `unavailable`, or `not-applicable` state for that task and runtime. A missing SDK operation must show its blocker and nearest supported alternative; it must not be hidden, replaced by unlabelled raw REST, or represented as an empty successful result.
- A snippet-level owner and `sourceOfTruth` repository/path/ref. The page may assemble tabs from multiple canonical repositories, but publication never forks or hand-copies a snippet without provenance.

Raw REST is always inspectable through the server-contract request/response panel. It may also appear as a teaching tab when the wire contract is itself the lesson, but it does not count as Python or .NET SDK coverage. Framework variants belong inside the relevant language tab or a linked framework page, not as duplicate job cards.

The request/response inspector must:

- Show the actual redacted HTTP method, resolved URL, headers, query/body, status, response headers, and bounded response captured for the current run rather than a hand-written approximation.
- Switch with the selected protocol alternative and language tab while preserving the one normalized expected-result comparison.
- Copy the request as a safe URL or reproducible command and copy/download the bounded raw response and normalized receipt.
- Offer Open Request only for safe idempotent requests whose credentials can remain out of the URL and browser history. Otherwise disable the action with the reason and provide a redacted copyable command.
- Prevent secrets, bearer tokens, API keys, cookies, tenant identifiers, and oversized payloads from appearing in source, copied commands, URLs, screenshots, receipts, or telemetry.
- Link the exact server docs/OpenAPI operation and the manifest service entry used by the run.

#### Configure in Console panel

Relevant job pages may include one `Configure in Console` panel after the server contract and before SDK tabs. The panel explains how an operator establishes the server-side configuration that the executable job consumes. It is not required for read-only jobs with no meaningful Console setup, and its absence must not create a duplicate Console-specific gallery card.

The panel contract requires:

- The exact Console route, route parameters, Console release/version, required role/permissions, server capability key, and demo manifest service key.
- An annotated screenshot captured from the implemented screen with sanitized fixture/test data. Callouts identify the controls and values that correspond to the server contract; annotations must not obscure errors, maturity labels, or security warnings.
- Equivalent copyable configuration as canonical JSON plus the supported raw API request and CLI command where available. The executable configuration, schema, and expected server receipt are primary; the screenshot never replaces them.
- A safe-data statement identifying the fixture or sanitized test records used for capture. Secrets, tokens, cookies, account identifiers, internal hostnames, personal data, and production resource identifiers are redacted at capture and rejected by automated policy scanning.
- Accessible alt text describing the purpose and state, ordered callout text that does not depend on color or image position alone, and a caption stating the task, product/version, maturity, and capture context.
- A desktop capture for an implemented desktop workflow. Add a mobile capture only when the Console route is supported and the configuration task is meaningful on mobile; do not manufacture a mobile layout solely to satisfy a screenshot count.
- Provenance binding the screenshot to source commit, server image digest/version, Console artifact/version, service key, fixture/demo manifest digest, capture timestamp, expiry/TTL, viewport/browser/theme/locale, and the exact configuration digest it depicts.
- A Playwright interaction receipt proving the annotated screen was reached through the declared role and route, the configuration controls represented the expected values, save/apply produced the expected server receipt, and the screenshot bytes match the admitted golden visual artifact.

Screenshots are evidence of an implemented UI state, not product mockups. If the Console screen is `planned` or otherwise lacks executable evidence, the panel shows a planned/partial status, the raw server configuration contract, owner, and blocker without a fabricated screenshot or disabled controls pretending the workflow exists.

Console panels reuse one governed screenshot evidence system across Examples, Walkthroughs, Projects, product docs, and release receipts. The canonical screenshot and metadata live once under their declared `sourceOfTruth`; other surfaces project that evidence by immutable id/digest rather than copying image files independently.

#### AI capability context panel

Relevant job pages may include one optional `AI capability context` panel. AI is a bounded way to draft, explain, or plan the existing job; it does not create a duplicate AI gallery card or a new support claim for the underlying server/SDK operation.

The panel contract requires:

- The exact supported AI surface, tool name/schema/version, host product/version, capability key, and owner. A generic provider integration or prose prompt is not evidence that the job has an AI surface.
- An allowlist of tasks such as explain capability, draft bounded input, draft configuration, draft code/scaffold, or propose an execution plan. Each task states whether it is read-only, draft-only, approval-required, or prohibited.
- The exact demo manifest service key, server/SDK schema versions, input/output schemas, resource/maturity state, and evidence supplied as model/tool context. Context is structured and bounded rather than scraped from arbitrary page text.
- Provider, model, endpoint, configuration, retention, residency, and data boundary. The page identifies which data and metadata may leave the product boundary and which provider/model settings produced the receipt.
- Prompt-injection defenses, untrusted-data labeling, privacy/PII policy, secret redaction, tool-argument validation, output schema validation, and denial behavior for unsupported or malicious instructions.
- Deterministic validation after model output: parse into a versioned schema, resolve capability and service ids, apply bounds/policy, dry-run or explain, compare with the canonical job contract, and reject fabricated endpoints, fields, symbols, or capabilities.
- An approval envelope containing exact proposed actions, arguments, target service/resource, identity/scope, expiry, idempotency key, expected effects, rollback/cleanup, and the artifact/config digests being approved.
- A prohibited-actions list. No AI path autonomously publishes, submits, cancels, deletes, mutates data/configuration, changes permissions/secrets, widens bounds, or approves its own plan.
- A complete manual fallback that performs the same supported job without an AI provider and links the same server contract, SDK mappings, Reference matrix, expected result, and safety bounds.
- Provenance and receipt binding prompt/template id and digest, structured context digest, provider/model/config, tool schema/version, draft/plan, validation results, approval actor/time/scope, executed action if any, normalized semantic result, and denial/fallback state.

If the AI surface or job-specific tool is unimplemented, the panel is `planned` or `partial` and shows the proposed schema, owner, blocker, manual path, and prohibited actions. It must not show fabricated chat output, an unverified tool call, or an enabled approval/execution control.

For Query Features, the supported AI flow is natural language to a bounded normalized query preview. The user sees the resolved service, protocol alternative, fields, filters, spatial predicate, ordering, limit, estimated/capability warnings, and concrete request derivation before approval. Execution uses the same validated query contract and semantic assertion as the manual page; the model never sends an unpreviewed query or silently broadens the bound.

For the Python geoprocessing Walkthrough, AI may draft a scaffold, dependency/configuration proposal, typed input/output schema, or bounded authoring/execution plan only where that exact surface is evidenced. Registration/publish, job submit, cancel, result deletion/cleanup, image/artifact promotion, and any configuration/data mutation require explicit scoped approval after deterministic validation. The manual author/build/register/submit/observe/cancel/result/cleanup path remains primary and complete.

#### Required Reference matrix

Every public job page contains one generated Reference matrix. It identifies the exact supported implementation entrypoints for the job rather than approximate commands, likely symbol names, or pseudocode.

| Cell | Required content |
|---|---|
| Raw HTTP | Deep link to the exact generated OpenAPI operation and protocol/version documentation; HTTP method, endpoint template, request/response schemas/media types, minimum server version, support tier, owner, and auth/cancel/error semantics. Include each protocol alternative inside the same cell group. |
| CLI | Exact installed command and subcommand, package/tool name and minimum version, deep link to generated command reference, copyable invocation, and a runnable `--help` receipt proving the command exists. Include auth/profile, cancellation/interrupt, exit-code, and stderr/error semantics. |
| JavaScript | Exact exported symbol deep link, package and minimum version, support tier, owner, authentication inputs, AbortSignal/cancellation, disposal, and typed-error semantics. |
| Python | Exact importable symbol deep link, distribution/import package and minimum version, support tier, owner, authentication, cancellation, context/resource cleanup, and exception semantics. |
| .NET | Exact public type/method deep link, package/assembly and minimum target/version, support tier, owner, authentication, `CancellationToken`, disposal, and exception/result semantics. |

Every primary symbol called by an inline code tab deep-links to its generated reference entry. Generated validation proves the referenced package/version exports the symbol and that the displayed call compiles or loads. A missing implementation is an explicit `partial`, `unavailable`, or `not-applicable` capability-gap cell with owner and blocker; the page never invents a near-match, substitutes raw HTTP without labeling it, or presents a future signature as current.

#### Query Features: first job and semantic-equivalence page

The first cross-SDK task page is a bounded feature query because it exercises connection, authentication, request construction, cancellation, errors, paging, and normalized results without requiring renderer parity.

| Shared contract | Required value |
|---|---|
| Service and fixture | One manifest-selected Maui FeatureServer/OGC Features source and one byte-pinned local fixture representing the same records. |
| Server capability | One canonical query capability key with the supported protocol mappings and evidence state generated from server truth. |
| Protocol alternatives | GeoServices FeatureServer query, OGC API Features collection items/search behavior, and OData query are documented explicitly when supported. Each alternative shows its exact version, HTTP method, endpoint template, parameter/body mapping, media type, auth, raw request/response, and any semantic limitation. |
| Input | One bounded attribute predicate, explicit field projection and ordering, spatial reference, and maximum result count. |
| Expected result | The same normalized ordered feature ids, projected fields, geometry/spatial-reference summary, count, and no undeclared degradation. |
| Assertion | Compare normalized semantic receipts, not serialized request text or language-native object shapes. |
| JavaScript tab | Published JS SDK query path with AbortSignal-style cancellation and JS SDK typed-error handling. |
| Python tab | Published Python SDK query path with Python environment/install steps, its cancellation mechanism, context/resource cleanup, and typed exception handling. |
| .NET tab | Published .NET SDK query path with package/framework setup, `CancellationToken`, `await using`/disposal as applicable, and typed exception handling. |

The page compares protocol semantics without claiming identical wire features: GeoServices `where`/field/order/paging, OGC API Features filter/query parameters and conformance, and OData `$filter`/`$select`/`$orderby`/`$top` are mapped to the same bounded query intent and their limitations are explicit. Unsupported filter, ordering, projection, paging, or spatial-reference behavior produces a partial/unavailable protocol state, never client-side sleight of hand presented as server equivalence.

After the attribute-query page qualifies, reuse the model for bbox/spatial query, statistics, export, geometry operations, and geoprocessing. Do not create `query-features-js`, `query-features-python`, `query-features-dotnet`, `query-features-ogc`, or `query-features-odata` cards.

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

Cross-SDK progression: qualify the Query Features job first with its server-contract/protocol inspector, JavaScript, Python, and .NET tabs, and one normalized receipt; then apply the same job-page model to bbox/spatial filtering, paging/order/projection, statistics, cancellation, and supported exports. Renderer-only tasks remain language/runtime-specific when no meaningful semantic equivalence exists.

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

Python geoprocessing curriculum:

1. Install and pin the Python SDK, configure endpoint/authentication safely, inspect GeometryServer, GPServer, and OGC API Processes capability, and report partial/unavailable operations explicitly.
2. Execute one bounded synchronous geometry operation against a pinned fixture and compare its normalized result with the equivalent JavaScript and .NET task tabs.
3. Submit one asynchronous geoprocessing/process job with stable input serialization and an idempotency/correlation identifier where supported.
4. Poll typed progress with bounded backoff, surface server messages, retrieve the declared result artifact, and record execution timing and degradation in the normalized receipt.
5. Cancel polling and server work using the Python SDK's actual cancellation contract; distinguish client wait cancellation from confirmed server-job cancellation.
6. Handle authentication, validation, unsupported capability, timeout, partial result, failed job, and expired-result errors with Python-native exception/resource idioms.
7. Dispose sessions/resources, redact a diagnostics bundle, and run the same fixture in CI against the pinned Python package artifact.

Python pages do not claim parity merely because raw REST can reach the endpoint. Until a public Python SDK operation exists and passes its pinned compile/run and semantic receipt gate, the Python tab is `partial` or `unavailable` with the owning blocker.

#### Walkthrough: Author and run a cloud-native Python geoprocessing job in Honua Studio

This is one job-centered Walkthrough, not separate Studio, Python, OGC Processes, GPServer, JavaScript, or .NET cards. Its canonical route is `/walkthroughs/python-cloud-geoprocessing-job/`. It links one production Project, `Cloud-Native Python Geoprocessing Job`, at `/projects/python-cloud-geoprocessing-job/`.

The Walkthrough must not imply that Honua Studio provides a Python authoring, build, packaging, or publishing surface until the generated capability matrix links authoritative implementation and executable evidence for that exact contract. A planned outline may be visible as a roadmap/reference page, but it cannot be marked runnable, supported, or live.

Every named step carries a generated `current`, `partial`, or `planned` state, evidence link, owner, and blocker. `current` requires passing fixture evidence against pinned product bytes and, when the step claims the public environment, a fresh live receipt. Code presence, a raw endpoint, or a neighboring product feature is insufficient.

##### Authoring-plane panel

The authoring-plane panel appears before execution instructions and treats Studio as a distinct product boundary:

| Step | Research-date state | Required contract and evidence to advance |
|---|---|---|
| Studio project and scaffold | `planned` | A versioned Studio project type, canonical scaffold, save/reopen lifecycle, source ownership, and executable fixture evidence. No authoritative Studio Python authoring contract is established by the evidence summarized in this plan. |
| Python runtime and dependencies | `planned` | Supported Python/runtime versions, dependency declaration and lock format, permitted native/system dependencies, deterministic install, package policy, and offline build evidence. |
| Input/output data contracts | `partial` | Typed parameter, feature/table/raster/file, CRS, schema, size/bounds, media type, validation, and result contracts aligned with server process metadata and SDK models. Current server process exposure does not by itself prove the complete authoring contract. |
| Identity and secrets | `partial` | Author identity, build identity, runtime service identity, tenant scope, secret references, least privilege, redaction, rotation, and proof that secrets never enter source, images, logs, receipts, or result artifacts. Generic auth primitives are not proof of a Studio job-secret lifecycle. |
| Resource, time, retry, and idempotency bounds | `partial` | CPU/memory/storage/network limits, maximum duration, concurrency, retry/backoff, idempotency/correlation keys, duplicate-submission behavior, cancellation deadline, quota errors, and deterministic limit fixtures. |
| Build, package, image, and artifact | `planned` | Reproducible build command, lockfile, source digest, SBOM/provenance, package or OCI image digest, signing/admission policy, vulnerability/license gate, immutable artifact storage, and rollback/retention contract. |
| Server process registration and publish | `planned` | Versioned registration/publish API, capability key, process id/version, input/output metadata, artifact digest binding, authorization, dry-run/validation, atomic activation, prior-version rollback, audit receipt, and exact OpenAPI/server-doc links. |

##### Execution-plane panel

The execution-plane panel begins with the published server contract and keeps raw protocol behavior inspectable before SDK mappings:

| Step | Research-date state | Required contract and evidence to advance |
|---|---|---|
| Discover the published process | `partial` | Exact OGC API Processes, GeoServices GPServer, or other supported discovery operation, protocol/version, method, endpoint template, manifest service key, auth, raw response, server docs, and capability evidence. Server exposure exists, but the client and demo contracts are not yet complete. |
| Submit the job | `partial` | Bounded request, synchronous/asynchronous mode, process/artifact version, idempotency key, accepted response, job id, retry classification, and normalized submission receipt. |
| Observe logs and progress | `partial` | Authorized structured logs, server messages, progress/state model, timestamps, correlation id, polling or subscription bounds, redaction, retention, and terminal-state semantics. |
| Cancel | `partial` | Distinguish cancellation of the client wait from confirmed server-job cancellation; prove idempotent cancel, race with completion, timeout, and terminal receipt behavior. |
| Retrieve results and provenance | `partial` | Typed inline or artifact result, media type/schema/CRS, checksums, generating code/package/image/process versions, input provenance, warnings/degradation, signed URL behavior, and normalized semantic assertion. |
| Cleanup and TTL | `planned` | Job, logs, intermediate data, output artifact, image, and secret-reference retention; expiry visibility; explicit cleanup; safe repeated cleanup; quota reclamation; and retention-policy receipt. |
| Local and CI fixture | `planned` | Pinned local runner or service fixture exercising author, build/admit, register, submit, observe, cancel, result, provenance, and cleanup without network or live credentials. General Python sample execution is not evidence for this end-to-end job. |
| Public live receipt | `planned` | Manifest-advertised sandbox process target, immutable published artifact, bounded anonymous or scoped test identity, reset/cleanup owner, fresh semantic receipt, quotas, and canary. The current demo manifest does not establish this target. |

##### Required page mappings

The Walkthrough and Project link the exact raw server operations for authoring/registration, process discovery, submission, status/log/progress, cancellation, results, and cleanup. Methods and endpoint templates are generated from the pinned OpenAPI/server manifest rather than invented in prose.

The Python tab is primary for authoring and implementation. It links the exact pinned Python SDK job/package APIs for project creation where supported, registration/publish, submit, observe, cancel, retrieve, and cleanup. Any missing operation is visibly `partial` or `unavailable` with its source owner and blocker; raw REST does not silently substitute for SDK support.

JavaScript and .NET tabs cover invocation of the same published process where their public SDKs support discovery, submit, progress, cancellation, and result retrieval. They share the execution-plane service, fixture, expected result, assertion, and normalized receipt, but do not duplicate the authoring Walkthrough or claim identical syntax. If authoring is Python-only, JS/.NET authoring is `not-applicable`; invocation support is evaluated independently.

##### Walkthrough acceptance criteria

- The page renders separate Authoring plane and Execution plane panels, with every step showing `current`, `partial`, or `planned`, authoritative evidence, owner, and blocker.
- Every `current` code step compiles/loads and runs against pinned Studio, Python SDK, server image, package/image, fixture, and manifest bytes as applicable.
- The local/CI run and live run, when live is claimed, produce the same normalized expected result and a receipt binding source, inputs, process version, code/package/image digest, server version, result checksum, provenance, timings, warnings, cancellation state, and cleanup/expiry state.
- The request/response inspector exposes redacted actual registration and execution operations with safe Copy and conditional Open behavior and exact server-doc/OpenAPI links.
- Failure fixtures cover invalid inputs, missing capability, unauthorized secret access, resource/time limit, duplicate/idempotent submission, build/admission failure, job failure, cancellation races, expired result, and repeated cleanup.
- The Walkthrough is not promoted to `supported` while a required authoring or execution step remains `partial` or `planned`. A narrower execution-only page may qualify independently only if it is labeled as a different job outcome.

##### Production Project contract

`Cloud-Native Python Geoprocessing Job` is the single production-shaped Project composed by the Walkthrough. It includes the canonical Studio project/scaffold when that surface exists, Python source and lockfile, typed input/output schemas, deterministic fixture, build/package/image definition, SBOM/provenance, deployment/registration manifest, least-privilege identity and secret references, resource/retry/idempotency policy, client invocation examples, logs/progress dashboards, result storage/TTL policy, rollback and cleanup runbooks, and exact fixture/live receipts.

The Project is not a second tutorial card and does not fork code from the Walkthrough. The Walkthrough links milestone diffs into the Project's immutable `sourceOfTruth`; the Project links back to its focused query, process invocation, cancellation, result, and diagnostics Examples. It cannot be published as a production Project until both panels' required steps are `current` and the project passes exact packed-artifact, fixture, live, security, provenance, cleanup, rollback, and observability gates.

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
4. Query Features with one bounded attribute filter through the unified job page: server contract and FeatureServer/OGC/OData alternatives first, then JavaScript/Python/.NET mappings.
5. Run one bounding-box query through the same cross-SDK model after the Query Features page qualifies.
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

When server-side setup is part of the Project, link its governed `Configure in Console` panel and executable JSON/API/CLI configuration. Do not embed a separate or stale Project-only screenshot of the same Console state.

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
- Every enabled language snippet compiles or loads and runs against its declared pinned SDK artifact; unavailable and partial tabs validate their explicit state and blocker instead of being skipped silently.
- All supported language tabs for a cross-SDK task produce the same normalized semantic receipt for the canonical fixture and expected result. Language-specific request syntax and native object/exception shapes are not compared for equality.
- Every job page renders the server-contract panel before language tabs and its inspector proves the selected protocol's actual redacted request/response, safe Copy behavior, conditional Open Request behavior, and exact docs/manifest links.
- Generated catalog validation proves one public card per job id. Protocol, language, framework, and repository variants cannot emit duplicate cards or competing canonical routes.
- Every rendered `Configure in Console` screenshot has a current Playwright interaction and golden-visual receipt, provenance/TTL, accessible alt/callouts/caption, sanitized-data and redaction proof, and byte/digest equality with the admitted screenshot artifact.
- Console visual drift fails admission until an assigned owner accepts an intentional new golden or fixes the regression. Planned or unimplemented Console routes fail if they provide a fabricated screenshot instead of planned status and the executable raw contract.
- Every rendered AI panel names an evidenced surface/tool, passes injection/privacy and deterministic schema/policy validation, keeps prohibited autonomous actions disabled, records approval before any protected action, and proves its manual fallback and provenance receipt.
- Every Reference matrix cell deep-links a generated entry and passes existence/version/support/owner/auth/cancel/error validation. Missing SDK or CLI cells remain explicit gaps; approximate commands, symbols, and pseudocode fail admission.

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
| Governed Console visuals | Current Console screenshots and their provenance/interaction/golden receipts are retained for at least 90 days after replacement; superseded goldens retain their review decision and replacement link for at least 180 days. |
| Visual drift review | Zero unreviewed visual diffs at promotion. Intentional updates require the named panel owner to approve the new golden with linked source/server/console/config versions and accessibility review. |
| AI plan validity | 100% of admitted AI drafts/plans parse against the pinned tool schema, resolve only declared capabilities/services/fields, satisfy bounds/policy, and pass deterministic dry-run or explain validation before approval is offered. |
| AI approval and evidence | 100% of approval-required actions have a valid scoped, unexpired human approval envelope and provenance receipt; zero prohibited autonomous actions execute. |
| Reference integrity | 100% of non-gap HTTP/CLI/JS/Python/.NET cells deep-link an existing generated reference at the pinned minimum version; all code-tab primary symbols and CLI `--help` receipts validate. |
| Alerting | Canary, drift, promotion, or rollback failures notify the named owner through the configured operational channel and create or update a durable incident record. |
| First-map onboarding | In a quarterly clean-environment usability run, at least 90% of participants complete the supported First Map path in 5 minutes without opening Project-sized source. |
| Cross-SDK task equivalence | 100% of supported JavaScript, Python, and .NET tabs compile/load and run against pinned SDK versions and match the canonical normalized semantic receipt; every non-supported tab has an explicit state, owner, and blocker. |
| Job-card uniqueness and server transparency | Exactly one canonical card/route per public job; 100% of job pages expose a current server-contract panel and passing request/response inspector acceptance. |

The current six-hour demo canary and Chromium gallery smoke are inputs to this design, not proof that all SLOs above are already met. Terraform drift detection must be enabled, fail or page according to policy rather than neutral-no-op indefinitely, and report known out-of-band resources until reconciled.

## Generated capability-task denominator

One generated matrix joins the server capability registry, SDK catalog, demo manifest, sample catalog, and current receipts. Its canonical row key is:

`developer job + capability + protocol + runtime + support tier`

The matrix is the denominator for completeness. The developer job is the public-card key; protocol and SDK/language implementations are matrix dimensions inside that job, not separate gallery rows. This avoids duplicate cards, protocol-first navigation, and the unbounded, low-value rule that every SDK method needs its own Example.

| Metric | Calculation | Required target |
|---|---|---|
| Supported executable coverage | Supported rows with a passing canonical Example or golden journey / all supported rows | 100% before a supported release claim |
| Supported live compatibility | Live-capable supported rows with an unexpired live receipt / all live-capable supported rows | 100% at gallery promotion |
| Reference coverage | Supported rows linked to exact SDK and protocol reference / all supported rows | 100% |
| Project composition coverage | Public Projects linking all composing Examples and Walkthroughs / all public Projects | 100% |
| Explicit gap coverage | Partial, preview, experimental, and planned rows with an evidence-backed status/gap card / all non-supported rows | 100% |
| Cross-SDK semantic equivalence | Supported language implementations with pinned compile/run receipts matching the task's normalized semantic receipt / all supported language implementations | 100% |
| Canonical job uniqueness | Public job ids with exactly one card and canonical route / all public job ids | 100% |
| Server-contract transparency | Public job pages with a verified capability/protocol/endpoint/auth/request/response/docs/manifest panel / all public job pages | 100% |

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
- Establish the governed screenshot evidence store and capture workflow once, including Playwright interaction proof, golden comparison, redaction scanning, accessibility metadata, TTL, owner review, and immutable projection into docs/catalog pages.
- Generate the per-job Reference matrix from server, CLI, and SDK reference artifacts, and establish the AI context/validation/approval receipt schema without promoting planned AI tools.
- Add an accurate `demo.honua.io` root response and path-preserving domain redirects, then verify them as release routes.
- Resolve draft [`PR #28`](https://github.com/honua-io/honua-samples/pull/28) only after its recorded [`honua-sdk-js#1111`](https://github.com/honua-io/honua-sdk-js/pull/1111) bundle dependency and all admitted semantics pass against the byte-bound handoff.

Exit: the release substrate meets the SLO table with a deliberately failed staging candidate and successful automatic preservation/restoration of the prior public release.

### Stage 2: beginner vertical slice

- Publish the 8 Examples, First Map Walkthrough, and Maui Data Explorer Project in the initial increment.
- Make Query Features the first unified job page, with its server-contract and FeatureServer/OGC/OData inspector before JavaScript, Python, and .NET tabs over one fixture, service key, expected result, assertion, and normalized receipt.
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
- Extend the unified task-page model from query to spatial filters, statistics, exports, geometry, and Python-led geoprocessing, while preserving explicit per-language support states and owners.
- Enforce accessibility, keyboard, CSP, cleanup, bundle, and performance gates across every supported route rather than treating them as optional examples.

Exit: the generated matrix covers the ordinary competitor-baseline tasks with executable content or explicit evidence-backed gap cards.

### Stage 5: mutable and partial workflows

- Complete editing/offline sync, realtime, auth, geocoding, routing, process execution, PMTiles publishing, and AI approval/execution only after the SDK contracts and demo services qualify.
- Deliver `Author and run a cloud-native Python geoprocessing job in Honua Studio` as one Walkthrough plus the `Cloud-Native Python Geoprocessing Job` Project only after the authoring-plane and execution-plane evidence gates qualify; until then retain the per-step planned/partial roadmap without a runnable Studio claim.
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
- Shared GIS jobs publish one canonical card with a server-contract/request-response panel followed by owned JavaScript, Python, and .NET tabs; protocol alternatives stay inside the job, each supported tab runs against pinned SDK bytes and produces the same normalized semantic receipt, and partial/unavailable states remain explicit.
- The Python cloud-geoprocessing Walkthrough and Project expose separate authoring and execution planes, bind every current step to authoritative pinned evidence, keep unproven Studio authoring planned, and prove build-to-result provenance, cancellation, cleanup/TTL, and equivalent JS/.NET invocation semantics where supported.
- Relevant jobs expose one governed `Configure in Console` panel whose implemented screenshot, accessible annotations, executable JSON/API/CLI configuration, provenance, interaction receipt, golden review, and retention all pass; planned UI is represented by planned status and raw contracts, never fabricated imagery.
- Relevant jobs expose one bounded AI context panel with deterministic plan validation, explicit approvals, prohibited autonomous actions, manual fallback, and provenance; Query previews normalized bounded queries and geoprocessing keeps publish/submit/cancel/delete approval-gated.
- Every job exposes an exact Reference matrix for HTTP, CLI, JavaScript, Python, and .NET; supported cells resolve to real generated symbols/commands at pinned versions and missing cells are explicit owned capability gaps.
- `samples.honua.io` is canonical, `sample.honua.io` redirects path-for-path, `honua.io/samples` does not fork the catalog, and the `demo.honua.io` root advertises the exact live manifest and health/documentation links.
- Promotion, detection, evidence retention, alerting, and automatic rollback meet the release SLO table, including a periodic rollback drill.
- No public sample hard-codes a demo endpoint absent from its pinned manifest, labels fixture output as live, or promotes a partial/experimental capability as supported.
- Search results expose capability-task state, content kind, portfolio track, support tier, runtime, canonical source, evidence freshness, owner, and blocker so product gaps and documentation gaps remain distinct.
- COG, STAC, PMTiles, GeoParquet/GeoArrow, and Coverages/WCS have prominent gated vertical slices. Zarr appears only at its evidenced maturity, and NetCDF/HDF5/GRIB remain reference-only until real readers qualify.
