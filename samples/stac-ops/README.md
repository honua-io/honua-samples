# STAC operations dashboard

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
This operator dashboard inspects STAC metadata; native data reads and edits need their own transport evidence.

A standalone Blazor WebAssembly dashboard for inspecting a Honua STAC catalog,
collection validators, extension declarations, query probes, and request timing.
It consumes the server HTTP API and is deployed independently of Honua Server.

Run from the repository root with the .NET 10 SDK:

```bash
dotnet run --project samples/stac-ops/Honua.StacOpsDemo.csproj --urls http://localhost:5173
```

Open `http://localhost:5173/?source=http://localhost:8080` with a running Honua
Server that permits browser requests from `http://localhost:5173`. The Source
field can select a different server. The target must allow the required CORS
requests and expose its STAC catalog. This app does not provision a server or
modify its catalog. It does not provide the retired in-server `/samples/stac-ops`
route.

The dashboard keeps cached collection-list validators separate from collection
detail validators, checks declared and observed extensions, and probes paging,
sort, fields, and CQL2 filtering. Failed or inconclusive probes stay visible.
A healthy dashboard alone does not certify a server release.

CI publishes the WebAssembly assets to ignored `artifacts/stac-ops/` and runs
the dashboard service and reload-coordination regression tests:

```bash
dotnet test samples/stac-ops/tests/StacOps.Tests.csproj --configuration Release
dotnet publish samples/stac-ops/Honua.StacOpsDemo.csproj --configuration Release --output artifacts/stac-ops
npm ci
npx playwright install chromium
node --test samples/stac-ops/verify-standalone.mjs
```

The dashboard and its existing regression cases were ported from the public
Honua Server sample at `1862dfcec975fab720665957c501ab97f41a3738`. Their original
Fair Core License is preserved in [LICENSE](LICENSE).
