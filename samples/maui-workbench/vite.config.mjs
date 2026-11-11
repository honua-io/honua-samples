import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { loadDepthAssets } from './build/depth-assets.mjs';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { depth: fileURLToPath(new URL('./index.html', import.meta.url)),
      analysis: fileURLToPath(new URL('./analysis.html', import.meta.url)) } } },
  plugins: [{
    name: 'verified-numeric-depth',
    async buildStart() {
      if (!process.env.HONUA_DEPTH_DIR) return;
      for (const asset of await loadDepthAssets(process.env.HONUA_DEPTH_DIR)) this.emitFile(asset);
    },
  }],
});
