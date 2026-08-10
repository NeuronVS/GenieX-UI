import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
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
              external: ['electron-store'],
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
