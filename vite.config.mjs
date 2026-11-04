import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react-vendor';
        },
      },
    },
  },
  worker: {
    rollupOptions: {
      output: {
        // The WinUI resource indexer reads ".worker-<hash>" in a file name as an invalid qualifier.
        entryFileNames: (chunk) => `assets/${chunk.name.replaceAll(".", "-")}-[hash].js`,
      },
    },
  },
  optimizeDeps: {
    // Otherwise the scan treats every HTML file in artifacts/ as an entry.
    entries: ["index.html"],
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    watch: {
      // Test and build output, which grows with every desktop run. Watching
      // .artifacts alone keeps the dev server from ever answering.
      ignored: ["**/.artifacts/**", "**/artifacts/**", "**/.tools/**", "**/.claude/**", "**/dist/**"],
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
