import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `buffer` is aliased so @solana/web3.js works in the browser without a
// full node-polyfill plugin; `globalThis.Buffer` is set in src/main.tsx.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
  define: {
    "process.env": {},
  },
  worker: {
    format: "es",
  },
});
