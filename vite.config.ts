import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// Plugin to copy index.html to 200.html for Replit SPA routing
function replitSpaPlugin() {
  return {
    name: 'replit-spa',
    closeBundle() {
      const indexPath = path.resolve(process.cwd(), 'dist/index.html');
      const fallbackPath = path.resolve(process.cwd(), 'dist/200.html');
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, fallbackPath);
        console.log('Created 200.html for Replit SPA routing');
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    replitSpaPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-light.png', 'favicon-dark.png', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Sultan Wallet',
        short_name: 'Sultan',
        description: 'Zero-fee blockchain wallet for SLTN',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "@assets": path.resolve(process.cwd(), "attached_assets"),
    },
  },
  server: {
    host: "0.0.0.0",
    watch: {
        ignored: ["**/node_modules/**", "**/.git/**", "**/.cache/**"],
    },
    allowedHosts: true,
  },
  root: process.cwd(),
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
