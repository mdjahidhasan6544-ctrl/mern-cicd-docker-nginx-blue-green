import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",   // Required so Vite is reachable inside Docker
    port: 5173,
    proxy: {
      "/api": {
        // In Docker dev the backend container is named "backend"; locally use localhost
        target: process.env.VITE_BACKEND_PROXY_URL || "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
