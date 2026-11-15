# Native application path

Start new customer applications with authenticated gRPC for live queries and
approved edits, and cloud-native files for public or read-heavy maps and analysis.
The wire contract is [geospatial-grpc](https://github.com/honua-io/geospatial-grpc).
[ADR-0087](https://github.com/honua-io/honua-server/blob/94140bb5afdc356b451e68d51be0633fef4682f7/docs/internal/contributor/adr/0087-native-client-protocols.md)
records the client-protocol direction.
OGC API and GeoServices REST examples demonstrate compatibility with third-party
tools and existing clients during coexistence. They are not the target transport
for a migrated application.

## Browser setup

Browsers use gRPC-Web; they cannot open a native HTTP/2 gRPC client connection.
The SDK uses the Connect library with its gRPC-Web transport, which does not
select the Connect wire protocol. ADR-0087 leaves that protocol for a later ADR. The published JavaScript SDK exposes the query
transport below. Install its optional runtimes explicitly:

```sh
npm install @honua/sdk-js@0.3.2 @bufbuild/protobuf@^2 @connectrpc/connect@^2 @connectrpc/connect-web@^2
```

Configure the client in the signed-in application, using its existing session's
short-lived access token. Never put an admin key or token in a URL, static config,
committed file or public bundle.

```js
import { HonuaClient } from '@honua/sdk-js';

const client = new HonuaClient({
  baseUrl: apiOrigin,
  transport: 'grpc-web',
  bearerToken: accessToken,
});
const page = await client.queryFeatures({
  serviceId,
  layerId,
  where: "status = 'exercise_scheduled'",
  outFields: ['*'],
  returnGeometry: true,
  outSr: 4326,
  resultRecordCount: 20,
});
```

`apiOrigin`, `accessToken`, `serviceId` and `layerId` come from the authenticated
application and the exact activated layer receipt. This is a bounded first page,
not a complete export. Refresh the application session and replace the client
when its token expires; do not silently fall back to anonymous or REST requests.
Exercise results must retain `DEMO DATA` and the provenance fields checked by the
[shared validator](../shared/state-local/exercise-provenance.mjs).

This setup is a transport example, **not a qualified browser build or a completed
demo**. SDK 0.3.2 loads the optional transport dynamically. Installing peers alone
does not prove that a production bundler includes those runtime modules. Before
switching a demo, run its production bundle in a browser, verify that the gRPC-Web
modules load and inspect actual RPC traffic. A missing runtime, rejected
preflight, expired credential or unavailable RPC must produce a visible error.
The deployment must support gRPC-Web, the application's exact browser origin,
Authorization/content-type preflight and readable gRPC status trailers. Test a
denied identity as well as a successful query; HTTP 200 alone is not RPC success.

Use generated clients from the same versioned geospatial-grpc contract for live
operations not exposed by the selected SDK transport. Do not assume that changing
the query transport changes metadata discovery, statistics, streaming or edits.
Each operation needs a supported client/server contract and real-server evidence.
Human approval, tenant scope, write denial and idempotency still apply to edits.
JavaScript, Python and .NET REST snippets remain compatibility evidence until each
published native client path has been independently exercised.

## Public maps and read-heavy analysis

Publish versioned PMTiles for map tiles, GeoParquet for vector snapshots and COG
for raster windows through the existing CDN. gRPC responses are not CDN-cacheable
file reads; do not replay feature RPCs for every public map pan or bulk download.
Use the snapshot's actual publication receipt, source date, CRS, attribution,
checksum and immutable version. PMTiles, GeoParquet and COG are different formats;
select only the ones a use case needs rather than inventing a raster or archive.

A file reader must issue HTTP Range requests and receive `206 Partial Content`
with a correct `Content-Range`. Verify the deployed CDN path, browser CORS and
bounded transferred bytes. A server returning an entire file for a small range
is a failure, not a successful range-read demo. An object URL or successful HEAD
request alone does not establish this behavior. Preserve NoData, fictional
exercise labels and stale-source warnings in derived displays and exports.

## Private files and updates

Keep private artifacts private. After authenticating and authorizing the caller,
a backend issues a short-lived signed URL for that caller's permitted artifact.
Signing credentials never reach the browser. Do not log signed URLs or put them
in share links, analytics, committed fixtures or public configuration. Verify an
expired URL and an unauthorized caller cannot retrieve the private object, and
that shared CDN caching cannot disclose it to another caller.

When data changes, regenerate the affected files, publish a new immutable object
version and update the authorized manifest only after checksum validation. Issue
fresh signed URLs for the new version; re-signing an old file does not update its
contents. Clients must renew expired URLs through the authenticated backend and
make the source/version visible. Signing, expiry, cache isolation and regeneration
must be tested on the selected existing deployment before claiming readiness.

## Maui demo migration status

| Journey | Native lead | Current evidence and remaining work |
| --- | --- | --- |
| Parcels, zoning and permits | PMTiles display; authenticated gRPC parcel/overlay lookup | Existing viewer uses FeatureServer lookup/discovery. Validate native query/geometry parity; permits remain a verified county lookup, never invented records. |
| 311 | Versioned public files for the public dashboard; gRPC for authenticated live status and approved edits | Existing anonymous SDK dashboard and OGC feed checks are compatibility coverage. Native paging/filter results and snapshot freshness remain unqualified. |
| Emergency preparedness | Public PMTiles/COG snapshots; gRPC for authenticated exercise updates | Existing periodic REST refresh is not a live gRPC stream. Preserve exercise labels and historical hazard vintages. |
| Public works | Public asset snapshots; gRPC for authorized work orders, inspections and field edits | Existing SDK query and maintenance board use compatibility transport; field edit/sync remains unconnected. |
| Workbench | GeoParquet vectors and COG windows; authenticated gRPC for live selections | Existing raster checks establish only their recorded scope; FeatureServer table/chart/filter queries still need native contracts and parity checks. |

The [data pipeline](state-local-data.md) still uses Honua's administrative import
and publishing flows. Upstream government download URLs are source interfaces,
not a recommendation for the customer's application transport. The current
[stock MCP setup](state-local-mcp.md) uses a REST-backed published package; a
successful answer there does not qualify the native application path.

For each migration, retain exact package and candidate versions, browser network
evidence, independent feature/geometry/attribute oracles, range-read receipts and
write denials. Run OGC API, GeoJSON/CSV and GeoServices checks afterwards, labelled
**compatibility**. Keep existing compatibility samples working. Do not relabel a
manifest as gRPC or mark a demo ready until the actual entrypoint uses and passes
the native transport. No shared deployment or infrastructure change is authorized
by this guide.
