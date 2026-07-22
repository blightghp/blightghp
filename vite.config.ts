import { defineConfig } from "vite";

export default defineConfig({
  // No Pages, a aplicação vive sob o nome do repositório; no Tauri, os caminhos são relativos.
  base: process.env.GITHUB_ACTIONS ? "/blightghp/" : "./",
  clearScreen: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
