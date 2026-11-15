# A public plugin endpoint

Start application development with the [native application path](../../docs/native-applications.md):
authenticated gRPC and browser gRPC-Web, public PMTiles/GeoParquet/COG via CDN
range reads, and private signed files regenerated when their data changes.
This authoring sample tests the custom endpoint contract; it does not qualify a native application transport.

Implement `ICustomEndpoint` from the public Honua plugin contract and execute it
without a server. The example returns a typed JSON response for a read-only
`utility/status` endpoint and verifies its status code, media type, and payload.

The plugin SDK is not yet published as a standalone NuGet package. The sample
uses its exact public source revision from `config/server-sdk.v1.json` under
ignored `artifacts/server-sdk/`; product code is not vendored into the sample.
Run from the repository root with Git and the .NET 10 SDK:

```bash
bash scripts/sync-server-sdk.sh
dotnet run --project samples/plugin-endpoint/PluginEndpointDemo.csproj --configuration Release
```

Expected output is a JSON object containing `"status":"ok"` and the plugin name.
CI executes the same command. For source development, `HONUA_SERVER_CHECKOUT`
can explicitly select a different SDK checkout.

This demonstrates the public extension contract. It does not host a server,
register a production endpoint, or provide runtime assembly loading. Server
plugin registration remains a build-time host integration.

The original example's Fair Core License is preserved in [LICENSE](LICENSE).
