import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages precisa do subdiretório; o bundle do Tauri precisa de URLs relativas.
  base: process.env.GITHUB_ACTIONS ? "/blightghp/" : "./",
  clearScreen: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
