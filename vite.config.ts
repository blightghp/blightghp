import { defineConfig } from "vite";

export default defineConfig({
  // No Pages, a aplicação vive sob o nome do repositório; no Tauri, os caminhos são relativos.
  base: process.env.GITHUB_ACTIONS ? "/blightghp/" : "./",
  clearScreen: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Three.js core is intentionally isolated; 525 kB is the audited
    // uncompressed ceiling for this dependency chunk in the current lockfile.
    chunkSizeWarningLimit: 526,
    rollupOptions: {
      output: {
        manualChunks: {
          "three-core": ["three"],
          "three-controls": ["three/examples/jsm/controls/OrbitControls.js"],
          "three-geometry": ["three/examples/jsm/geometries/ConvexGeometry.js"],
          "three-postprocessing": [
            "three/examples/jsm/postprocessing/EffectComposer.js",
            "three/examples/jsm/postprocessing/RenderPass.js",
            "three/examples/jsm/postprocessing/UnrealBloomPass.js",
          ],
        },
      },
    },
  },
});
