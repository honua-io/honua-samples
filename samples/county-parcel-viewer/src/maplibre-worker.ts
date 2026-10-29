// MapLibre GL JS 6 loads its worker as a separate ES module resolved against
// its own import.meta.url, which a production bundle rewrites. Vite's
// `?worker&url` emits the worker as a real asset and returns its hashed,
// base-relative URL, which is what setWorkerUrl needs (same pattern as the
// create-honua-app starters). Import this before the first map is created.

import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(maplibreWorkerUrl);
