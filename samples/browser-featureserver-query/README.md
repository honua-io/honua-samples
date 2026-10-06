# Query a FeatureServer in the browser

Use plain browser `fetch()` to discover a public FeatureServer layer and read
three features. There is no SDK, build step, account, or API key.

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

`serve` listens on `http://localhost:3000` and logs
`Accepting connections at http://localhost:3000`. Open that URL in a browser;
it loads `index.html`. Stop the server with Ctrl+C.

The page displays the returned features and sets
`document.body.dataset.sampleStatus` to `pass` when the query succeeds.

## Parameters

The page reads optional query-string parameters, so the same file runs against any anonymous FeatureServer:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server to query. |
| `service` | `maui-buildings` | FeatureServer service name; the page reads its first layer. |
| `where` | `1=1` | Query filter. |

When the request fails the page shows `FAIL: <server error message>` and sets
`data-sample-status` to `fail` and `data-sample-error` to that message. For example, a service that does not
exist gives `FAIL: Not Found`, an invalid `where` gives `FAIL: Bad Request`, and a service that does not allow
anonymous reads gives `FAIL: Unauthorized`.

## Verification

`verify/` holds the Playwright spec the sample runner executes against a composed server, with a layer seeded from a
committed fixture. See [docs/browser-verification](../../docs/browser-verification/README.md).
