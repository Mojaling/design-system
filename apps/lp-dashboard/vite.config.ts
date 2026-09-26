import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const serverPort = Number(process.env.PORT ?? 4747)

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${serverPort}`,
      "/ws": { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
