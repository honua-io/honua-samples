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
