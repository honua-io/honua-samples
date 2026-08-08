# Query a FeatureServer in the browser

Use plain browser `fetch()` to discover a public FeatureServer layer and read
three features. There is no SDK, build step, account, or API key.

## Run

Serve `src/` with any static web server and open `index.html`.

```bash
npx serve src
```

The page displays the returned features and sets
`document.body.dataset.sampleStatus` to `pass` when the query succeeds.
