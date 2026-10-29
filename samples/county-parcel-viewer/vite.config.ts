import { defineConfig } from "vite";

// base "./" makes every built asset URL relative, so the same dist/ works at
// the gallery's /county-parcel-viewer/app/ path, at a local preview root, or
// from any directory a county copies it to.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // MapLibre alone is larger than Vite's default warning size.
    chunkSizeWarningLimit: 2500,
  },
});
