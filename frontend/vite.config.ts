import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const RAILWAY_API = "https://floodguard-production.up.railway.app";

// Proxy all API routes to Railway in dev (avoids CORS)
const API_ROUTES = [
  "/predict",
  "/model",
  "/live-risks",
  "/district-risks",
  "/alerts",
  "/reports",
  "/report",
  "/feedback",
  "/monitoring",
  "/emergency-priority",
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: Object.fromEntries(
      API_ROUTES.map((route) => [
        route,
        {
          target: RAILWAY_API,
          changeOrigin: true,
          secure: true,
        },
      ]),
    ),
  },
});
