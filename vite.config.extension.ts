import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { copyFileSync, mkdirSync, existsSync, cpSync } from "fs";

/**
 * Vite config for building the Sultan Wallet as a browser extension
 * Builds both Chrome (MV3) and Firefox (MV2) versions
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = path.resolve(process.cwd(), 'dist-extension');
        const distFirefoxDir = path.resolve(process.cwd(), 'dist-extension-firefox');
        const extDir = path.resolve(process.cwd(), 'extension');
        const publicDir = path.resolve(process.cwd(), 'public');
        
        // Ensure dist directories exist
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        if (!existsSync(distFirefoxDir)) {
          mkdirSync(distFirefoxDir, { recursive: true });
        }

        // Extension scripts to copy
        const extensionFiles = [
          'background.js',
          'content-script.js', 
          'inpage-provider.js'
        ];
        
        // Copy to Chrome dist
        for (const file of extensionFiles) {
          const src = path.join(extDir, file);
          const dest = path.join(distDir, file);
          if (existsSync(src)) {
            copyFileSync(src, dest);
            console.log(`Copied ${file} to dist-extension`);
          }
        }

        // Copy Chrome manifest (MV3)
        const manifestSrc = path.join(publicDir, 'manifest.json');
        const manifestDest = path.join(distDir, 'manifest.json');
        if (existsSync(manifestSrc)) {
          copyFileSync(manifestSrc, manifestDest);
          console.log('Copied manifest.json to dist-extension (Chrome MV3)');
        }

        // =====================================================
        // Firefox Build (MV2)
        // =====================================================
        
        // Copy all Chrome dist files to Firefox dist
        const distContents = ['assets', 'icons'];
        for (const item of distContents) {
          const src = path.join(distDir, item);
          const dest = path.join(distFirefoxDir, item);
          if (existsSync(src)) {
            cpSync(src, dest, { recursive: true });
          }
        }
        
        // Copy index.html
        const indexSrc = path.join(distDir, 'index.html');
        const indexDest = path.join(distFirefoxDir, 'index.html');
        if (existsSync(indexSrc)) {
          copyFileSync(indexSrc, indexDest);
        }
        
        // Copy extension scripts to Firefox dist
        for (const file of extensionFiles) {
          const src = path.join(extDir, file);
          const dest = path.join(distFirefoxDir, file);
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        }

        // Copy Firefox manifest (MV2)
        const manifestFirefoxSrc = path.join(publicDir, 'manifest.firefox.json');
        const manifestFirefoxDest = path.join(distFirefoxDir, 'manifest.json');
        if (existsSync(manifestFirefoxSrc)) {
          copyFileSync(manifestFirefoxSrc, manifestFirefoxDest);
          console.log('Copied manifest.firefox.json to dist-extension-firefox (Firefox MV2)');
        }
        
        console.log('');
        console.log('✅ Chrome extension: dist-extension/');
        console.log('✅ Firefox extension: dist-extension-firefox/');
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "@assets": path.resolve(process.cwd(), "attached_assets"),
    },
  },
  root: process.cwd(),
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(process.cwd(), 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  // Extension doesn't need dev server features
  define: {
    'process.env.IS_EXTENSION': JSON.stringify(true)
  }
});
