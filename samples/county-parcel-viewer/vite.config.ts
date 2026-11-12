import { defineConfig } from "vite";
import { fixturePlugin } from "./fixture/plugin.ts";

// base "./" makes every built asset URL relative, so the same dist/ works at
// the gallery's /county-parcel-viewer/app/ path, at a local preview root, or
// from any directory a county copies it to.
export default defineConfig(({ mode }) => ({
  plugins: mode === "fixture" ? [fixturePlugin()] : [],
  base: "./",
  build: {
    target: "es2022",
    // MapLibre alone is larger than Vite's default warning size.
    chunkSizeWarningLimit: 2500,
  },
}));
