import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

function copyNavaraAssets(): import("vite").Plugin {
  let outDir = "dist";
  return {
    name: "copy-navara-assets",
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const navaraAssets = path.resolve(
        "node_modules/@navaramap/three/dist/assets",
      );
      const destBase = path.resolve(outDir, "assets/assets");
      for (const dir of fs.readdirSync(navaraAssets)) {
        const src = path.join(navaraAssets, dir);
        if (!fs.statSync(src).isDirectory()) continue;
        const dest = path.join(destBase, dir);
        fs.cpSync(src, dest, { recursive: true });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "/earthquake-pulse/",
  plugins: [react(), copyNavaraAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8080,
  },
});
