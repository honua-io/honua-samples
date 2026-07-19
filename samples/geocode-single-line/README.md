# geocode-single-line

Plain-REST sample: no SDK, just `fetch()`. A single forward-geocode call
against Honua's Esri-compatible GeocodeServer -- no import/publish
bootstrap needed, since geocoding is a server-wide capability rather than
something scoped to a layer this sample has to create first.

## What it does

1. Requests
   `GET /rest/services/GeocodeServer/findAddressCandidates?SingleLine=...`
   for a known single-line address.
2. Asserts the top candidate has a non-empty `address`, a `location` with
   numeric `x`/`y` inside a loose bounding box around the expected region,
   and a numeric `score` -- the real Esri-shaped candidate structure, not
   just a 200 with an empty `candidates` array.

## Edition note

The canonical capability key list marks `geocoding.forward` as a Pro-tier
capability, and this sample's manifest honestly declares `"edition":
"pro"` to match. In practice, the compose stack's Community-tier image
answers this request anonymously via its built-in Nominatim-backed default
geocoder with no license check enforced -- which is what lets this sample
run and pass against the plain Community compose in CI today. This isn't
something this repo can or should silently paper over; see the PR that
introduced this sample for the full note, in case it's worth flagging
upstream in honua-server.

## External dependency note

The compose stack's default geocoder proxies to the public Nominatim
(OpenStreetMap) service, so this sample requires the `honua` container to
have outbound internet access. If it ever becomes flaky in a
network-restricted CI environment, that's the reason -- not a regression in
this sample's logic.

## Run it locally

From the repo root, with a composed server already running (see the
[top-level README](../../README.md#local-dev)):

```bash
node samples/geocode-single-line/src/run.mjs
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `HONUA_BASE_URL` | `http://localhost:8080` | Base URL of the composed server. |
| `HONUA_SAMPLE_ADDRESS` | `380 New York St, Redlands, CA` | Single-line address to geocode. |

Exit code is `0` on success, `1` on any failure (with a message describing
which step failed).
