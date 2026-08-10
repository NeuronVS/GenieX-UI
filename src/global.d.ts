/// <reference types="vite/client" />

import type { GeniexApi } from '../electron/preload';

declare global {
  interface Window {
    geniex: GeniexApi;
  }
}

export {};
