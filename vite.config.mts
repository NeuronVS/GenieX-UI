import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  server: {
    fs: {
      allow: ['.'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // electron-store's CJS export is directly callable, so leaving
              // it external + a plain require() works fine. check-disk-space
              // is NOT externalized: its CJS `.default` export gets
              // double-wrapped by esbuild's interop helper when external
              // (verified empirically — the runtime error was
              // "X is not a function" on the raw module object). Bundling it
              // directly lets esbuild's inliner resolve the default export
              // correctly instead.
              // pdf-parse MUST be external for a different reason: its
              // index.js runs a debug self-test (`if (!module.parent) {
              // readFileSync('./test/data/...pdf') }`) at import time.
              // Bundling it inline strips the real module.parent linkage
              // esbuild sets up, so the guard sees `!module.parent` as true
              // and crashes the app on load trying to read a file that
              // doesn't exist outside the package. Left external, it's a
              // real require() from node_modules, module.parent is the
              // requiring module as normal, and the guard is false.
              external: ['electron-store', 'pdf-parse'],
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
