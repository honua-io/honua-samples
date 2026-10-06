# Your first Honua app: create-honua-app react-ts

Scaffold the `react-ts` starter from the published
[`create-honua-app`](https://www.npmjs.com/package/create-honua-app) package and point it at a
FeatureServer layer on your Honua server.

## Run

```bash
npm create honua-app@0.1.5 my-map -- --template react-ts
cd my-map
npm install
VITE_HONUA_ENDPOINT=http://localhost:8080/rest/services/<service>/FeatureServer/<layerId> npm run dev
```

The layer must allow anonymous reads: the starter sends no credentials, and Vite would publish any key you gave it
in the page's JavaScript. Without `VITE_HONUA_ENDPOINT` the starter serves its own committed fixture instead.

When the layer answers, the page reports that the accepted plan is mounted and the map draws the layer's
polygons. When it does not, the page says `The workflow stopped: <reason>`; a layer that refuses anonymous
callers gives `The workflow stopped: HTTP 499: Unauthorized`.

## Verification

`package.json` pins the `create-honua-app` version this sample proves. `verify/` holds the Playwright spec the
sample runner executes: it scaffolds the app from that published version, installs it from the npm registry,
typechecks and builds it, seeds a fixture layer into the composed server, and checks the mounted map pixel by
pixel. See [docs/browser-verification](../../docs/browser-verification/README.md).
