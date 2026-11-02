# Address search for county apps

Send one single-line address to Honua's GeoServices GeocodeServer and put the
best candidate on a map. The pin carries the matched address, the score and
the provider; the status line says whether the match landed inside the county.
The default is the county building in Wailuku. One HTML file, no build step.

| | |
| --- | --- |
| Goal | Find an address and show it on a map |
| Level | Beginner |
| Time | About 8 minutes |
| Prerequisites | A modern web browser, internet access, any static file server |
| Libraries | `maplibre-gl@6.4.1` (ES module from jsDelivr, pinned) |

## Run

Serve `src/` with any static web server. With Node.js 20+:

<!-- doc-run: run ready-url="http://localhost:3000/" -->
```bash
npx serve src
```

Open `http://localhost:3000`. Type another address and press Find.

## What the code does

1. `GET /rest/services/GeocodeServer/findAddressCandidates?SingleLine=…&f=json`
   returns the candidates for the address.
2. The first candidate must carry an address, a numeric location and a
   numeric score, and its location must fall inside `region`. Anything else
   is a `FAIL`, including a confident match in the wrong state.
3. The candidate becomes a MapLibre marker with a popup (address, score,
   provider, coordinates) and the map jumps to it.

The `<pre>` under the map lists every request. There are no third-party
basemap tiles; the server's own Protomaps archive is used only if it answers.

The public demo geocoder depends on its configured upstream provider and on
internet access, so scores and address formatting are the provider's.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://demo.honua.io` | Honua server. |
| `address` | `200 S High St, Wailuku, HI` | Single-line address to geocode. |
| `region` | `-157.35,20.45,-155.95,21.25` | `minLon,minLat,maxLon,maxLat` the match must fall in (Maui Nui), or `none`. |
| `basemap` | (probe) | `none` skips the PMTiles basemap probe. |

On success the page sets `data-sample-status="pass"` with
`data-candidate-count`, `data-score`, `data-match-x`, `data-match-y` and
`data-sample-elapsed-ms`; on failure it shows `FAIL: <message>`.

## Verification

`verify/` holds the Playwright spec. Against the composed server it checks
that the county building resolves inside the region, that an address with no
candidate and a match outside the region both report `FAIL`, and that the
page's public-live default resolves on the public deployment within the time
budget. The composed server geocodes through whatever provider it is
configured with; when it has none, the positive composed-server check is
skipped with that reason and the public-live check remains the proof.
