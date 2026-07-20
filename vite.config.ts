import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/blightghp/",
  clearScreen: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
